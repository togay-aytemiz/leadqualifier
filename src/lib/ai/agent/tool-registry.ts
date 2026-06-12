import type { AgentRequest, AgentToolResult } from './contracts'

export type InternalAgentToolExecutionInput = {
  request: AgentRequest
  args: Record<string, unknown>
  claimIds: string[]
  signal: AbortSignal
}

export type InternalAgentTool = {
  name: `internal.${string}`
  description: string
  capability: string
  sourceGroups: string[]
  costClass?: 'free' | 'low' | 'medium' | 'high'
  canRunInParallel?: boolean
  execute: (input: InternalAgentToolExecutionInput) => Promise<AgentToolResult>
}

export type InternalAgentToolDescriptor = Omit<InternalAgentTool, 'execute'>

function descriptorOf(tool: InternalAgentTool): InternalAgentToolDescriptor {
  return {
    name: tool.name,
    description: tool.description,
    capability: tool.capability,
    sourceGroups: [...tool.sourceGroups],
    ...(tool.costClass === undefined ? {} : { costClass: tool.costClass }),
    ...(tool.canRunInParallel === undefined ? {} : { canRunInParallel: tool.canRunInParallel }),
  }
}

export function validateSourceGroups(
  request: AgentRequest,
  tool: InternalAgentToolDescriptor,
  requestedSourceGroups: string[] = []
): void {
  const allowedSourceGroups = new Set(request.sourcePolicy.allowedSourceGroups)
  const disallowedSourceGroups = Array.from(
    new Set([...tool.sourceGroups, ...requestedSourceGroups])
  ).filter(
    (sourceGroup) => !allowedSourceGroups.has(sourceGroup)
  )

  if (disallowedSourceGroups.length > 0) {
    throw new Error(
      `Agent tool source groups are not allowed: ${tool.name} (${disallowedSourceGroups.join(', ')})`
    )
  }
}

export function createInternalAgentToolRegistry(tools: InternalAgentTool[]) {
  const registeredTools = new Map<string, InternalAgentTool>()

  for (const tool of tools) {
    if (!tool.name.startsWith('internal.') || tool.sourceGroups.includes('external_web')) {
      throw new Error(`External agent tools are not allowed: ${tool.name}`)
    }
    if (registeredTools.has(tool.name)) {
      throw new Error(`Duplicate agent tool: ${tool.name}`)
    }

    registeredTools.set(tool.name, {
      ...tool,
      sourceGroups: [...tool.sourceGroups],
    })
  }

  return {
    get(name: string) {
      const tool = registeredTools.get(name)
      return tool ? descriptorOf(tool) : undefined
    },
    descriptors() {
      return Array.from(registeredTools.values(), descriptorOf)
    },
    names() {
      return Array.from(registeredTools.keys())
    },
    async execute(name: string, input: InternalAgentToolExecutionInput) {
      const tool = registeredTools.get(name)
      if (!tool) throw new Error(`Agent tool is not registered: ${name}`)

      const rawRequestedSourceGroups = input.args.sourceGroups ?? input.args.source_groups
      if (
        rawRequestedSourceGroups !== undefined &&
        (!Array.isArray(rawRequestedSourceGroups) ||
          rawRequestedSourceGroups.some((value) => typeof value !== 'string' || !value.trim()))
      ) {
        throw new Error(`Agent tool requested invalid source groups: ${name}`)
      }
      const requestedSourceGroups = Array.isArray(rawRequestedSourceGroups)
        ? rawRequestedSourceGroups.map((value) => value.trim())
        : []

      validateSourceGroups(input.request, descriptorOf(tool), requestedSourceGroups)
      return tool.execute(input)
    },
  }
}
