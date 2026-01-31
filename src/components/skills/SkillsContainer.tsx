'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Skill } from '@/types/database'
import { ClientSearchInput } from '@/components/common/ClientSearchInput'
import { Button, Input, TextArea, EmptyState, StatusDot } from '@/design'
import { createSkill, updateSkill, deleteSkill, toggleSkill } from '@/lib/skills/actions'

interface SkillsContainerProps {
    initialSkills: Skill[]
    organizationId: string
}

export function SkillsContainer({ initialSkills, organizationId }: SkillsContainerProps) {
    const router = useRouter()
    const [skills, setSkills] = useState<Skill[]>(initialSkills)
    const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    const [isSaving, setIsSaving] = useState(false)

    // Form state
    const [formData, setFormData] = useState({
        title: '',
        response_text: '',
        triggers: ''
    })

    // Sync skills when initialSkills changes (e.g. after search)
    useEffect(() => {
        setSkills(initialSkills)
    }, [initialSkills])

    // Update form when selection changes
    useEffect(() => {
        if (selectedSkillId) {
            const skill = skills.find(s => s.id === selectedSkillId)
            if (skill) {
                setFormData({
                    title: skill.title,
                    response_text: skill.response_text,
                    triggers: skill.trigger_examples.join(', ')
                })
                setIsCreating(false)
            }
        } else if (isCreating) {
            setFormData({
                title: '',
                response_text: '',
                triggers: ''
            })
        }
    }, [selectedSkillId, isCreating, skills])

    const handleCreateNew = () => {
        setSelectedSkillId(null)
        setIsCreating(true)
    }

    const handleSelectSkill = (id: string) => {
        setSelectedSkillId(id)
        setIsCreating(false)
    }

    const handleToggleSkill = async (e: React.MouseEvent, skill: Skill) => {
        e.stopPropagation()
        try {
            await toggleSkill(skill.id, !skill.enabled)
            router.refresh()
            // Optimistic update
            setSkills(prev => prev.map(s =>
                s.id === skill.id ? { ...s, enabled: !s.enabled } : s
            ))
        } catch (error) {
            console.error('Failed to toggle skill', error)
        }
    }

    const handleSave = async () => {
        if (!formData.title.trim() || !formData.response_text.trim()) return

        setIsSaving(true)
        try {
            const triggers = formData.triggers.split(',').map(t => t.trim()).filter(Boolean)

            if (isCreating) {
                await createSkill({
                    organization_id: organizationId,
                    title: formData.title,
                    response_text: formData.response_text,
                    trigger_examples: triggers,
                    enabled: true
                })
                setIsCreating(false)
                setSelectedSkillId(null) // Or select the new skill if we returned it
            } else if (selectedSkillId) {
                await updateSkill(selectedSkillId, {
                    title: formData.title,
                    response_text: formData.response_text,
                    trigger_examples: triggers
                })
            }
            router.refresh()
        } catch (error) {
            console.error('Failed to save skill', error)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!selectedSkillId || !confirm('Are you sure you want to delete this skill?')) return

        setIsSaving(true)
        try {
            await deleteSkill(selectedSkillId)
            setSelectedSkillId(null)
            router.refresh()
        } catch (error) {
            console.error('Failed to delete skill', error)
        } finally {
            setIsSaving(false)
        }
    }

    const selectedSkill = skills.find(s => s.id === selectedSkillId)
    const showForm = isCreating || selectedSkill

    return (
        <div className="flex h-full bg-white border-t border-gray-200">
            {/* Left Panel - List */}
            <div className="w-[35%] flex flex-col border-r border-gray-200 bg-gray-50/30">
                <div className="p-4 border-b border-gray-200 bg-white space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-gray-900">Skills</h2>
                        <Button variant="ghost" size="icon" onClick={handleCreateNew} className="text-blue-600 hover:bg-blue-50">
                            <span className="material-symbols-outlined">add</span>
                        </Button>
                    </div>
                    <ClientSearchInput />
                </div>
                <div className="flex-1 overflow-y-auto">
                    {skills.map(skill => (
                        <div
                            key={skill.id}
                            onClick={() => handleSelectSkill(skill.id)}
                            className={`px-4 py-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors relative group bg-white ${selectedSkillId === skill.id ? "bg-blue-50/30 ring-1 ring-inset ring-blue-500/20" : ""
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <span className={`text-sm font-medium ${selectedSkillId === skill.id ? "text-blue-700" : "text-gray-900"}`}>
                                    {skill.title}
                                </span>
                                <button
                                    onClick={(e) => handleToggleSkill(e, skill)}
                                    className="p-1 hover:bg-gray-100 rounded focus:outline-none"
                                >
                                    <StatusDot active={skill.enabled} className="" />
                                </button>
                            </div>
                            {selectedSkillId === skill.id && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500"></div>}
                        </div>
                    ))}
                    {skills.length === 0 && (
                        <div className="p-8 text-center text-gray-400 text-sm">
                            No skills found
                        </div>
                    )}
                </div>
            </div>

            {/* Right Panel - Detail/Form */}
            <div className="flex-1 flex flex-col bg-white overflow-y-auto">
                {showForm ? (
                    <div className="flex flex-col h-full">
                        {/* Header */}
                        <div className="h-14 border-b border-gray-200 px-6 flex items-center justify-between shrink-0 bg-white sticky top-0 z-10">
                            <h3 className="font-bold text-gray-900 text-lg">
                                {isCreating ? 'New Skill' : 'Edit Skill'}
                            </h3>
                            <div className="flex gap-2">
                                {!isCreating && (
                                    <Button variant="danger" size="sm" onClick={handleDelete} disabled={isSaving}>
                                        Delete
                                    </Button>
                                )}
                                <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                </Button>
                            </div>
                        </div>

                        {/* Form Content */}
                        <div className="p-8 space-y-6 max-w-2xl">
                            <Input
                                label="Skill Name"
                                value={formData.title}
                                onChange={(val) => setFormData(prev => ({ ...prev, title: val }))}
                                placeholder="e.g. Pricing Inquiry"
                                className="bg-white text-gray-900 border-gray-300"
                            />

                            <TextArea
                                label="Response Text"
                                value={formData.response_text}
                                onChange={(val) => setFormData(prev => ({ ...prev, response_text: val }))}
                                placeholder="The AI will respond with this text..."
                                className="min-h-[150px] bg-white text-gray-900 border-gray-300 text-base"
                            />

                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase">
                                    Triggers (Comma separated)
                                </label>
                                <div className="p-4 rounded-lg border border-gray-300 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                                    <textarea
                                        value={formData.triggers}
                                        onChange={(e) => setFormData(prev => ({ ...prev, triggers: e.target.value }))}
                                        placeholder="how much does it cost, what is the price, pricing plans..."
                                        className="w-full text-sm text-gray-900 placeholder-gray-400 outline-none resize-none min-h-[100px]"
                                    />
                                    <p className="mt-2 text-xs text-gray-500">
                                        Add multiple variations to help the AI understand better.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center p-8">
                        <EmptyState
                            icon="auto_awesome"
                            title="Select a skill"
                            description="Select a skill from the list to edit details"
                            action={
                                <Button variant="primary" onClick={handleCreateNew}>
                                    <span className="material-symbols-outlined text-[18px] mr-2">add</span>
                                    Create New Skill
                                </Button>
                            }
                        />
                    </div>
                )}
            </div>
        </div>
    )
}
