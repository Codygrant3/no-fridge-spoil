import { useState } from 'react';
import { useProfile, PROFILE_AVATARS, PROFILE_COLORS } from '../context/ProfileContext';
import { CaretDown, Check, Plus, Trash, UsersThree, X } from '@phosphor-icons/react';

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
        <div className="market-profile-switcher">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="market-profile-trigger"
                aria-expanded={isOpen}
            >
                {isHousehold ? (
                    <>
                        <UsersThree size={19} weight="regular" />
                        <span>Household</span>
                    </>
                ) : (
                    <>
                        <span className="market-avatar market-avatar-small">{activeProfile?.avatar}</span>
                        <span>{activeProfile?.name}</span>
                    </>
                )}
                <CaretDown size={14} weight="bold" className={isOpen ? 'rotate-180' : ''} />
            </button>

            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => { setIsOpen(false); setIsCreating(false); setConfirmDelete(null); }}
                    />

                    <div className="market-profile-popover">
                        <button
                            type="button"
                            onClick={() => { switchProfile(null); setIsOpen(false); }}
                            className={`market-profile-option ${isHousehold ? 'is-selected' : ''}`}
                        >
                            <div className="market-profile-icon">
                                <UsersThree size={18} />
                            </div>
                            <span>Household</span>
                            {isHousehold && <Check size={17} weight="bold" />}
                        </button>

                        {profiles.length > 0 && <div className="market-popover-divider" />}

                        {profiles.map(profile => (
                            <div key={profile.id} className="market-profile-row group">
                                <button
                                    type="button"
                                    onClick={() => { switchProfile(profile.id); setIsOpen(false); }}
                                    className={`market-profile-option ${activeProfileId === profile.id ? 'is-selected' : ''}`}
                                >
                                    <div
                                        className="market-avatar"
                                        style={{ backgroundColor: `${profile.color}18` }}
                                    >
                                        {profile.avatar}
                                    </div>
                                    <span>{profile.name}</span>
                                    {activeProfileId === profile.id && (
                                        <Check size={17} weight="bold" />
                                    )}
                                </button>

                                {confirmDelete === profile.id ? (
                                    <div className="market-profile-delete-confirm">
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleDelete(profile.id); }}
                                            className="market-confirm-delete"
                                        >
                                            Confirm
                                        </button>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                                            className="market-icon-button market-icon-button-small"
                                            aria-label="Cancel delete"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(profile.id); }}
                                        className="market-profile-delete"
                                        aria-label={`Delete ${profile.name}`}
                                    >
                                        <Trash size={16} />
                                    </button>
                                )}
                            </div>
                        ))}

                        <div className="market-popover-divider" />

                        {isCreating ? (
                            <div className="market-profile-create">
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    placeholder="Profile name"
                                    aria-label="Profile name"
                                    className="market-input"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                                />

                                <div>
                                    <p className="market-field-label">Avatar</p>
                                    <div className="market-avatar-grid">
                                        {PROFILE_AVATARS.map(avatar => (
                                            <button
                                                type="button"
                                                key={avatar}
                                                onClick={() => setNewAvatar(avatar)}
                                                className={`market-avatar-choice ${newAvatar === avatar ? 'is-selected' : ''}`}
                                            >
                                                {avatar}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <p className="market-field-label">Color</p>
                                    <div className="market-color-grid">
                                        {PROFILE_COLORS.map(color => (
                                            <button
                                                type="button"
                                                key={color}
                                                onClick={() => setNewColor(color)}
                                                className={`market-color-choice ${newColor === color ? 'is-selected' : ''}`}
                                                style={{ backgroundColor: color }}
                                                aria-label={`Use ${color}`}
                                            />
                                        ))}
                                    </div>
                                </div>

                                <div className="market-profile-actions">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreating(false)}
                                        className="market-secondary-button"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleCreate}
                                        disabled={!newName.trim()}
                                        className="market-primary-button"
                                    >
                                        Create
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setIsCreating(true)}
                                className="market-profile-option"
                            >
                                <div className="market-profile-icon">
                                    <Plus size={18} />
                                </div>
                                <span>Add profile</span>
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
