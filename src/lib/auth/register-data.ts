export interface RegisterFormData {
    email: string
    password: string
    fullName: string
    companyName: string
}

export function normalizeRegisterFormData(formData: FormData): RegisterFormData {
    return {
        email: String(formData.get('email') ?? '').trim(),
        password: String(formData.get('password') ?? '').trim(),
        fullName: String(formData.get('fullName') ?? '').trim(),
        companyName: String(formData.get('companyName') ?? '').trim(),
    }
}
