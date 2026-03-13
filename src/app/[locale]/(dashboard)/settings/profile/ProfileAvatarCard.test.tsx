import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileAvatarCard } from './ProfileAvatarCard'

const TEST_TITLE = 'Avatar'
const TEST_DESCRIPTION = 'Upload a photo'
const TEST_FORMAT_HINT = 'Saved as WebP'
const TEST_UPLOAD_LABEL = 'Upload avatar'
const TEST_REPLACE_LABEL = 'Replace avatar'
const TEST_SAVING_LABEL = 'Uploading...'
const TEST_INPUT_LABEL = 'Choose avatar'

describe('ProfileAvatarCard', () => {
    it('renders uploaded avatar preview when avatar url exists', () => {
        const markup = renderToStaticMarkup(
            <ProfileAvatarCard
                name="Togay Yilmaz"
                email="togay@example.com"
                avatarUrl="https://cdn.example.com/togay.webp"
                title={TEST_TITLE}
                description={TEST_DESCRIPTION}
                formatHint={TEST_FORMAT_HINT}
                uploadLabel={TEST_UPLOAD_LABEL}
                replaceLabel={TEST_REPLACE_LABEL}
                savingLabel={TEST_SAVING_LABEL}
                inputLabel={TEST_INPUT_LABEL}
                onSelectFile={() => {}}
            />
        )

        expect(markup).toContain('https://cdn.example.com/togay.webp')
        expect(markup).toContain(TEST_REPLACE_LABEL)
        expect(markup).toContain(TEST_FORMAT_HINT)
    })

    it('falls back to initials when no avatar exists', () => {
        const markup = renderToStaticMarkup(
            <ProfileAvatarCard
                name="Togay Yilmaz"
                email="togay@example.com"
                avatarUrl={null}
                title={TEST_TITLE}
                description={TEST_DESCRIPTION}
                formatHint={TEST_FORMAT_HINT}
                uploadLabel={TEST_UPLOAD_LABEL}
                replaceLabel={TEST_REPLACE_LABEL}
                savingLabel={TEST_SAVING_LABEL}
                inputLabel={TEST_INPUT_LABEL}
                onSelectFile={() => {}}
            />
        )

        expect(markup).toContain('TY')
        expect(markup).toContain(TEST_UPLOAD_LABEL)
    })
})
