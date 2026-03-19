import { useState } from 'react';
import { useProfile, PROFILE_AVATARS, PROFILE_COLORS } from '../context/ProfileContext';
import { ChevronDown, Plus, X, Check, Users, Trash2 } from 'lucide-react';

export function ProfileSwitcher() {
    const {
        profiles,
        activeProfile,
        activeProfileId,
        isHousehold,
        switchProfile,
        createProfile,
        deleteProfile,
    } = useProfile();

    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newAvatar, setNewAvatar] = useState(PROFILE_AVATARS[0]);
    const [newColor, setNewColor] = useState(PROFILE_COLORS[0]);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

    const handleCreate = async () => {
        if (!newName.trim()) return;
        const profile = await createProfile(newName.trim(), newAvatar, newColor);
        switchProfile(profile.id);
        setNewName('');
        setNewAvatar(PROFILE_AVATARS[0]);
        setNewColor(PROFILE_COLORS[0]);
        setIsCreating(false);
        setIsOpen(false);
    };

    const handleDelete = async (id: string) => {
        await deleteProfile(id);
        setConfirmDelete(null);
    };

    return (
        <div className="relative">
            {/* Profile Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] transition-all hover:border-[var(--accent-color)]/50"
            >
                {isHousehold ? (
                    <>
                        <Users className="w-4 h-4 text-[var(--accent-color)]" />
                        <span className="text-sm font-semibold text-white">Household</span>
                    </>
                ) : (
                    <>
                        <span className="text-lg">{activeProfile?.avatar}</span>
                        <span className="text-sm font-semibold text-white">{activeProfile?.name}</span>
                    </>
                )}
                <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => { setIsOpen(false); setIsCreating(false); setConfirmDelete(null); }}
                    />

                    <div
                        className="absolute top-full left-0 mt-2 w-64 rounded-2xl overflow-hidden z-50 border border-[var(--border-color)]"
                        style={{
                            background: 'rgba(10, 14, 26, 0.95)',
                            backdropFilter: 'blur(16px)',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
                        }}
                    >
                        {/* Household Option */}
                        <button
                            onClick={() => { switchProfile(null); setIsOpen(false); }}
                            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                                isHousehold ? 'bg-[var(--accent-color)]/10' : 'hover:bg-white/5'
                            }`}
                        >
                            <div className="w-8 h-8 rounded-full bg-[var(--accent-color)]/20 flex items-center justify-center">
                                <Users className="w-4 h-4 text-[var(--accent-color)]" />
                            </div>
                            <span className="text-sm font-semibold text-white flex-1 text-left">Household</span>
                            {isHousehold && <Check className="w-4 h-4 text-[var(--accent-color)]" />}
                        </button>

                        {/* Divider */}
                        {profiles.length > 0 && (
                            <div className="border-t border-[var(--border-color)]" />
                        )}

                        {/* Profile List */}
                        {profiles.map(profile => (
                            <div key={profile.id} className="relative group">
                                <button
                                    onClick={() => { switchProfile(profile.id); setIsOpen(false); }}
                                    className={`w-full flex items-center gap-3 px-4 py-3 transition-colors ${
                                        activeProfileId === profile.id ? 'bg-[var(--accent-color)]/10' : 'hover:bg-white/5'
                                    }`}
                                >
                                    <div
                                        className="w-8 h-8 rounded-full flex items-center justify-center text-lg"
                                        style={{ backgroundColor: `${profile.color}20` }}
                                    >
                                        {profile.avatar}
                                    </div>
                                    <span className="text-sm font-semibold text-white flex-1 text-left">{profile.name}</span>
                                    {activeProfileId === profile.id && (
                                        <Check className="w-4 h-4 text-[var(--accent-color)]" />
                                    )}
                                </button>

                                {/* Delete button */}
                                {confirmDelete === profile.id ? (
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
                                            className="p-1.5 bg-red-500/30 rounded-lg text-red-400 text-xs font-bold"
                                        >
                                            Confirm
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                                            className="p-1.5 bg-white/10 rounded-lg"
                                        >
                                            <X className="w-3 h-3 text-white" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(profile.id); }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-red-500/20 rounded-lg transition-all"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                                    </button>
                                )}
                            </div>
                        ))}

                        {/* Divider */}
                        <div className="border-t border-[var(--border-color)]" />

                        {/* Create Profile */}
                        {isCreating ? (
                            <div className="p-4 space-y-3">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="Profile name"
                                    className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl text-white text-sm outline-none"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                                />

                                {/* Avatar Picker */}
                                <div>
                                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wide mb-1.5">Avatar</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {PROFILE_AVATARS.map(avatar => (
                                            <button
                                                key={avatar}
                                                onClick={() => setNewAvatar(avatar)}
                                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-all ${
                                                    newAvatar === avatar
                                                        ? 'bg-[var(--accent-color)]/30 ring-2 ring-[var(--accent-color)] scale-110'
                                                        : 'bg-[var(--bg-tertiary)] hover:bg-white/10'
                                                }`}
                                            >
                                                {avatar}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Color Picker */}
                                <div>
                                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wide mb-1.5">Color</p>
                                    <div className="flex gap-1.5">
                                        {PROFILE_COLORS.map(color => (
                                            <button
                                                key={color}
                                                onClick={() => setNewColor(color)}
                                                className={`w-7 h-7 rounded-full transition-all ${
                                                    newColor === color ? 'ring-2 ring-white scale-110' : 'hover:scale-105'
                                                }`}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setIsCreating(false)}
                                        className="flex-1 py-2 bg-[var(--bg-tertiary)] rounded-xl text-white text-sm font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreate}
                                        disabled={!newName.trim()}
                                        className="flex-1 py-2 bg-[var(--accent-color)] rounded-xl text-white text-sm font-bold disabled:opacity-50"
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsCreating(true)}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                    <Plus className="w-4 h-4 text-[var(--text-secondary)]" />
                                </div>
                                <span className="text-sm font-semibold text-[var(--text-secondary)]">Add Profile</span>
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
