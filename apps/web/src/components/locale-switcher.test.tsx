import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const replace = vi.fn();

// The navigation helpers read Next's router context, which does not exist in a
// unit test. Substituting them keeps this test about the component's own
// behaviour; the real routing is covered by the Playwright journey.
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/',
}));

const { LocaleSwitcher } = await import('./locale-switcher');
const { renderWithProviders } = await import('@/test/render');

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it('AC1: renders a labelled select, so it is usable by keyboard and screen reader', () => {
    renderWithProviders(<LocaleSwitcher />);

    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
  });

  it('AC2: offers every supported locale', () => {
    renderWithProviders(<LocaleSwitcher />);

    expect(screen.getByRole('option', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Português (Brasil)' })).toBeInTheDocument();
  });

  it('AC3: shows the active locale as the current value', () => {
    renderWithProviders(<LocaleSwitcher />);

    expect(screen.getByRole('combobox')).toHaveValue('en');
  });

  it('AC4: navigates to the same page in the chosen locale', async () => {
    renderWithProviders(<LocaleSwitcher />);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'pt-BR');

    expect(replace).toHaveBeenCalledWith('/', { locale: 'pt-BR' });
  });

  it('AC5: names each locale in its own language, not the current one', () => {
    renderWithProviders(<LocaleSwitcher />);

    // Someone who cannot read the current language still has to find theirs.
    expect(screen.getByRole('option', { name: 'Português (Brasil)' })).toBeInTheDocument();
  });
});
