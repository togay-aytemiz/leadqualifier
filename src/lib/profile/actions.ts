'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import {
    PROFILE_AVATAR_BUCKET,
    buildProfileAvatarStoragePath,
    extractProfileAvatarStoragePathFromUrl
} from './avatar'

function requireSupabaseStorageEnv() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase storage configuration')
    }

    return { supabaseUrl, serviceRoleKey }
}

export async function updateProfile(fullName: string) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    const { error } = await supabase
        .from('profiles')
        .update({
            full_name: fullName,
            updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

    if (error) {
        console.error('Failed to update profile:', error)
        throw new Error(error.message)
    }
}

export async function prepareProfileAvatarUpload() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return { ok: false as const, reason: 'unauthorized' as const }
    }

    try {
        const { supabaseUrl, serviceRoleKey } = requireSupabaseStorageEnv()
        const version = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
        const storagePath = buildProfileAvatarStoragePath({
            userId: user.id,
            version
        })

        const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey)
        const storage = serviceClient.storage.from(PROFILE_AVATAR_BUCKET)
        const { data: signedUploadData, error: signedUploadError } = await storage.createSignedUploadUrl(storagePath)

        if (signedUploadError || !signedUploadData?.token) {
            throw signedUploadError ?? new Error('Missing signed upload token')
        }

        const { data: publicUrlData } = storage.getPublicUrl(storagePath)
        const publicUrl = publicUrlData?.publicUrl?.trim() ?? ''
        if (!publicUrl) {
            throw new Error('Could not resolve public URL for avatar upload')
        }

        return {
            ok: true as const,
            bucket: PROFILE_AVATAR_BUCKET,
            storagePath,
            uploadToken: signedUploadData.token,
            publicUrl
        }
    } catch (error) {
        console.error('Failed to prepare profile avatar upload:', error)
        return { ok: false as const, reason: 'request_failed' as const }
    }
}

export async function saveProfileAvatarUpload(storagePath: string) {
    const normalizedStoragePath = storagePath.trim()
    if (!normalizedStoragePath) {
        throw new Error('Invalid storage path')
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')
    if (!normalizedStoragePath.startsWith(`${user.id}/`)) {
        throw new Error('Avatar upload path does not belong to the current user')
    }

    const { supabaseUrl, serviceRoleKey } = requireSupabaseStorageEnv()
    const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey)
    const storage = serviceClient.storage.from(PROFILE_AVATAR_BUCKET)
    const { data: publicUrlData } = storage.getPublicUrl(normalizedStoragePath)
    const avatarUrl = publicUrlData?.publicUrl?.trim() ?? ''
    if (!avatarUrl) {
        throw new Error('Could not resolve avatar public URL')
    }

    const { data: currentProfile, error: currentProfileError } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', user.id)
        .maybeSingle()

    if (currentProfileError) {
        console.error('Failed to load current profile avatar:', currentProfileError)
        throw new Error(currentProfileError.message)
    }

    const previousStoragePath = extractProfileAvatarStoragePathFromUrl(currentProfile?.avatar_url)

    const { error: updateError } = await supabase
        .from('profiles')
        .update({
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString()
        })
        .eq('id', user.id)

    if (updateError) {
        console.error('Failed to save profile avatar:', updateError)
        throw new Error(updateError.message)
    }

    if (previousStoragePath && previousStoragePath !== normalizedStoragePath) {
        const { error: removeError } = await storage.remove([previousStoragePath])
        if (removeError) {
            console.warn('Failed to remove previous profile avatar object:', removeError)
        }
    }

    return { avatarUrl }
}
