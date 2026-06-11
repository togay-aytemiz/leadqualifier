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
  const { execute: _execute, ...descriptor } = tool
  return {
    ...descriptor,
    sourceGroups: [...descriptor.sourceGroups],
  }
}

export function validateSourceGroups(
  request: AgentRequest,
  tool: InternalAgentToolDescriptor
): void {
  const allowedSourceGroups = new Set(request.sourcePolicy.allowedSourceGroups)
  const disallowedSourceGroups = tool.sourceGroups.filter(
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

      validateSourceGroups(input.request, descriptorOf(tool))
      return tool.execute(input)
    },
  }
}
