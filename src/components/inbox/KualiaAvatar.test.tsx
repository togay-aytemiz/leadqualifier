import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { KualiaAvatar } from './KualiaAvatar'

describe('KualiaAvatar', () => {
    it('renders the dark branded avatar treatment', () => {
        const markup = renderToStaticMarkup(<KualiaAvatar />)

        expect(markup).toContain('from-slate-950')
        expect(markup).toContain('to-slate-700')
        expect(markup).toContain('shadow-[0_0_24px_rgba(15,23,42,0.24)]')
        expect(markup).toContain('/icon-white.svg')
    })
})
