import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('AC1: renders a real button element, so it is focusable and announced as one', () => {
    render(<Button>Send</Button>);

    expect(screen.getByRole('button', { name: 'Send' })).toBeInstanceOf(HTMLButtonElement);
  });

  it('AC2: defaults to type="button", so it cannot submit a surrounding form', () => {
    render(<Button>Send</Button>);

    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('AC3: calls the handler on click', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Send</Button>);

    await userEvent.click(screen.getByRole('button'));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('AC4: activates on Enter and Space, like any button', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Send</Button>);

    screen.getByRole('button').focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('AC5: marks a loading button busy and ignores its clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Uploading
      </Button>,
    );
    const button = screen.getByRole('button');

    await userEvent.click(button);

    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('AC6: keeps a loading button in the tab order, unlike a disabled one', () => {
    render(<Button loading>Uploading</Button>);
    const button = screen.getByRole('button');

    button.focus();

    expect(button).toHaveFocus();
    expect(button).not.toBeDisabled();
  });

  it('AC7: a disabled button reports itself as disabled', () => {
    render(<Button disabled>Send</Button>);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('AC8: forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Send</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('AC9: passes through arbitrary button attributes', () => {
    render(<Button aria-label="Send question">Send</Button>);

    expect(screen.getByRole('button', { name: 'Send question' })).toBeInTheDocument();
  });
});
