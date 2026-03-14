import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfileAvatarCard } from './ProfileAvatarCard'

const TEST_TITLE = 'Profil fotoğrafı'
const TEST_DESCRIPTION = 'Sidebar ve operatör mesajlarında, sadece Qualy içinde kullanılacak profil fotoğrafınızı yükleyin.'
const TEST_HINT = 'Fotoğrafa tıklayarak önizleyebilirsiniz.'
const TEST_UPLOAD_LABEL = 'Profil fotoğrafı yükle'
const TEST_REPLACE_LABEL = 'Profil fotoğrafını değiştir'
const TEST_SAVING_LABEL = 'Yükleniyor...'
const TEST_INPUT_LABEL = 'Profil fotoğrafı seç'
const TEST_PREVIEW_LABEL = 'Profil fotoğrafını önizle'
const TEST_PREVIEW_TITLE = 'Profil fotoğrafı önizleme'

describe('ProfileAvatarCard', () => {
    it('renders profile photo copy and a preview trigger when an uploaded image exists', () => {
        const markup = renderToStaticMarkup(
            <ProfileAvatarCard
                name="Togay Yilmaz"
                email="togay@example.com"
                avatarUrl="https://cdn.example.com/togay.webp"
                title={TEST_TITLE}
                description={TEST_DESCRIPTION}
                formatHint={TEST_HINT}
                uploadLabel={TEST_UPLOAD_LABEL}
                replaceLabel={TEST_REPLACE_LABEL}
                savingLabel={TEST_SAVING_LABEL}
                inputLabel={TEST_INPUT_LABEL}
                previewLabel={TEST_PREVIEW_LABEL}
                previewTitle={TEST_PREVIEW_TITLE}
                onSelectFile={() => {}}
            />
        )

        expect(markup).toContain(TEST_TITLE)
        expect(markup).toContain(TEST_DESCRIPTION)
        expect(markup).toContain(TEST_HINT)
        expect(markup).toContain(TEST_REPLACE_LABEL)
        expect(markup).toContain(TEST_PREVIEW_LABEL)
        expect(markup).toContain('https://cdn.example.com/togay.webp')
    })

    it('falls back to initials and hides the preview trigger when no uploaded image exists', () => {
        const markup = renderToStaticMarkup(
            <ProfileAvatarCard
                name="Togay Yilmaz"
                email="togay@example.com"
                avatarUrl={null}
                title={TEST_TITLE}
                description={TEST_DESCRIPTION}
                formatHint={TEST_HINT}
                uploadLabel={TEST_UPLOAD_LABEL}
                replaceLabel={TEST_REPLACE_LABEL}
                savingLabel={TEST_SAVING_LABEL}
                inputLabel={TEST_INPUT_LABEL}
                previewLabel={TEST_PREVIEW_LABEL}
                previewTitle={TEST_PREVIEW_TITLE}
                onSelectFile={() => {}}
            />
        )

        expect(markup).toContain('TY')
        expect(markup).toContain(TEST_UPLOAD_LABEL)
        expect(markup).not.toContain(TEST_PREVIEW_LABEL)
    })
})
