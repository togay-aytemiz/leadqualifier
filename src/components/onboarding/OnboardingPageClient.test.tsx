import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ONBOARDING_PAGE_CLIENT_PATH = path.resolve(
  process.cwd(),
  'src/components/onboarding/OnboardingPageClient.tsx'
)

describe('OnboardingPageClient source', () => {
  it('keeps the first step expanded by default and renders progress', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain('const [expandedStepId, setExpandedStepId] = useState(')
    expect(source).toContain('steps.find((step) => step.isExpandedByDefault)?.id')
    expect(source).toMatch(/steps\.find\(\(step\) => !step\.isComplete\)\?\.id \?\?/)
    expect(source).not.toContain('expandedStep.isComplete')
    expect(source).toContain('if (!expandedStepId) return')
    expect(source).toContain('completedSteps')
    expect(source).toContain('totalSteps')
    expect(source).toContain('dispatchOnboardingStateUpdated')
    expect(source).toContain('effectiveOnboardingState')
  })

  it('greets the user directly instead of rendering a redundant page header block', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain('userName')
    expect(source).toContain("t('greeting'")
    expect(source).toContain('👋')
    expect(source).toContain('text-lg font-semibold')
    expect(source).toContain('sm:text-xl')
    expect(source).not.toContain('text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl')
    expect(source).not.toContain('<PageHeader')
    expect(source).not.toContain("t('kicker')")
    expect(source).not.toContain("t('title')")
    expect(source).not.toContain("t('subtitle')")
  })

  it('keeps all steps visible instead of filtering completed ones away', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain('steps.map((step) => (')
    expect(source).not.toContain('steps.filter((step) => !step.isComplete)')
  })

  it('reads checklist copy from the snake_case translation keys used in messages', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain("t('steps.agent_setup.description')")
    expect(source).toContain("t('steps.business_review.description')")
    expect(source).toContain("t('steps.ai_settings_review.description')")
    expect(source).toContain("t('steps.connect_whatsapp.description')")
    expect(source).toContain("t('steps.intro.visuals.appointments.title')")
  })

  it('links business review directly to organization details and includes an ai settings review step', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain('/settings/organization?focus=organization-details')
    expect(source).toContain('/settings/ai')
    expect(source).toContain("if (stepId === 'ai_settings_review')")
    expect(source).toContain('optimisticCompletedStepIds')
    expect(source).toContain("optimisticCompletedStepIds.has(step.id)")
    expect(source).toContain("next.add('ai_settings_review')")
  })

  it('reuses the same skills and knowledge icons as the sidebar navigation', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain('HiOutlineSparkles')
    expect(source).toContain('HiOutlineSquare3Stack3D')
    expect(source).not.toContain('icon: <Database size={18} />')
    expect(source).not.toContain('icon: <Bot size={18} />')
  })

  it('uses responsive single-column fallbacks for mobile step content', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain('space-y-4')
    expect(source).not.toContain('lg:grid-cols-')
  })

  it('adds extra breathing room under the trial banner before the onboarding greeting', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain('px-4 pt-8 pb-5')
    expect(source).toContain('bg-violet-600 text-white hover:bg-violet-700')
    expect(source).toContain('bg-violet-500 transition-all')
  })

  it('shows a mobile-only recommendation banner for completing onboarding on a larger screen', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain("t('recommendedBanner.title')")
    expect(source).toContain("t('recommendedBanner.body')")
    expect(source).toContain('lg:hidden')
    expect(source).toContain('border-amber-200')
    expect(source).toContain('bg-amber-50')
  })

  it('uses a simpler respond-style layout instead of nested wrapper cards', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).not.toContain('rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6')
    expect(source).not.toContain('rounded-2xl border border-slate-200 bg-slate-50 p-4')
    expect(source).not.toContain("t('steps.intro.chips.instantReplies')")
    expect(source).not.toContain('rounded-2xl border border-slate-200/80 bg-white px-4 py-4')
    expect(source).toContain("item.body ? 'items-start' : 'items-center'")
    expect(source).toContain("import Image from 'next/image'")
  })

  it('shows channel artwork with messenger marked as coming soon', () => {
    const source = fs.readFileSync(ONBOARDING_PAGE_CLIENT_PATH, 'utf8')

    expect(source).toContain('src="/whatsapp.svg"')
    expect(source).toContain('src="/instagram.svg"')
    expect(source).toContain('src="/Telegram.svg"')
    expect(source).toContain('src="/messenger.svg"')
    expect(source).toContain('width={28}')
    expect(source).not.toContain('bg-emerald-50')
    expect(source).not.toContain('bg-rose-50')
    expect(source).not.toContain('bg-indigo-50')
    expect(source).not.toContain('<Send size={28}')
    expect(source).toContain("t('steps.connect_whatsapp.channels.messenger.comingSoon')")
  })
})
