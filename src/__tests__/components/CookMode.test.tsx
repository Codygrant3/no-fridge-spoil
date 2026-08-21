import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recipe } from '../../services/recipeService';

const voiceMock = vi.hoisted(() => ({
    startListening: vi.fn(),
    stopListening: vi.fn(),
    speak: vi.fn(),
    destroy: vi.fn(),
}));

vi.mock('../../services/voiceService', () => ({
    VoiceService: class {
        startListening() {
            voiceMock.startListening();
        }

        stopListening() {
            voiceMock.stopListening();
        }

        speak(text: string) {
            voiceMock.speak(text);
        }

        destroy() {
            voiceMock.destroy();
        }
    },
}));

import { CookMode } from '../../components/CookMode';

const recipe: Recipe = {
    title: 'Skillet Eggs',
    description: 'A quick breakfast skillet.',
    ingredients: ['2 eggs', '1 tbsp butter', 'pinch of salt'],
    instructions: [
        'Crack the eggs into a bowl.',
        'Melt the butter in a skillet.',
        'Cook the eggs until just set.',
    ],
    prepTime: '5 min',
    cookTime: '5 min',
    difficulty: 'Easy',
    usedIngredients: ['eggs', 'butter'],
};

function renderCookMode(onClose = vi.fn()) {
    return {
        onClose,
        ...render(<CookMode recipe={recipe} items={[]} onClose={onClose} />),
    };
}

describe('CookMode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the recipe title and first instruction', () => {
        renderCookMode();

        expect(screen.getByRole('heading', { name: 'Skillet Eggs' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Crack the eggs into a bowl.' })).toBeInTheDocument();
        expect(screen.getByText('STEP 1 OF 3')).toBeInTheDocument();
    });

    it('advances with Next Step and returns with Previous', async () => {
        const user = userEvent.setup();
        renderCookMode();

        await user.click(screen.getByRole('button', { name: 'NEXT STEP' }));
        expect(screen.getByRole('heading', { name: 'Melt the butter in a skillet.' })).toBeInTheDocument();
        expect(screen.getByText('STEP 2 OF 3')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'PREVIOUS' }));
        expect(screen.getByRole('heading', { name: 'Crack the eggs into a bowl.' })).toBeInTheDocument();
        expect(screen.getByText('STEP 1 OF 3')).toBeInTheDocument();
    });

    it('calls onClose when Exit Cook Mode is pressed', async () => {
        const user = userEvent.setup();
        const { onClose } = renderCookMode();

        await user.click(screen.getByRole('button', { name: 'Exit Cook Mode' }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('toggles an ingredient checked state', async () => {
        const user = userEvent.setup();
        renderCookMode();

        await user.click(screen.getByRole('button', { name: 'Check 2 eggs' }));
        expect(screen.getByRole('button', { name: 'Uncheck 2 eggs' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Uncheck 2 eggs' }));
        expect(screen.getByRole('button', { name: 'Check 2 eggs' })).toBeInTheDocument();
    });

    it('opens and closes voice help without breaking cook mode controls', async () => {
        const user = userEvent.setup();
        renderCookMode();

        const helpButton = screen.getByRole('button', { name: 'Voice commands help' });
        helpButton.focus();
        expect(helpButton).toHaveFocus();

        await user.click(helpButton);
        expect(screen.getByRole('heading', { name: 'Voice Commands' })).toBeInTheDocument();

        fireEvent.keyDown(window, { key: 'Escape' });
        const closeHelp = screen.queryByRole('button', { name: 'Close voice commands help' });
        if (closeHelp) {
            await user.click(closeHelp);
        }

        expect(screen.queryByRole('heading', { name: 'Voice Commands' })).not.toBeInTheDocument();

        const restoredHelp = screen.getByRole('button', { name: 'Voice commands help' });
        restoredHelp.focus();
        expect(restoredHelp).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Exit Cook Mode' })).toBeInTheDocument();
    });
});
