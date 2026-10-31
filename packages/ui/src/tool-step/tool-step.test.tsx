import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ToolStep } from './tool-step';

const props = {
  name: 'search_docs',
  status: 'done' as const,
  statusLabel: 'Done',
  toggleLabel: 'Show what search_docs did',
  inputLabel: 'Input',
  outputLabel: 'Output',
};

describe('ToolStep', () => {
  it('AC2: names the tool that ran', () => {
    render(<ToolStep {...props} input="{}" />);

    expect(screen.getByText('search_docs')).toBeVisible();
  });

  it('shows the status as a word, not only a colour', () => {
    render(<ToolStep {...props} status="failed" statusLabel="Failed" input="{}" />);

    expect(screen.getByText('Failed')).toBeVisible();
  });

  it('collapses the detail by default', () => {
    // A tool result is often hundreds of lines; a transcript that dumps all of
    // it buries the answer the reader came for.
    render(<ToolStep {...props} input="{}" output="{}" />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Input')).toBeNull();
  });

  it('AC2: shows the input and output when expanded', async () => {
    render(<ToolStep {...props} input='{"query":"tokens"}' output='{"results":[]}' />);

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByText('Input')).toBeVisible();
    expect(screen.getByText('{"query":"tokens"}')).toBeVisible();
    expect(screen.getByText('{"results":[]}')).toBeVisible();
  });

  it('collapses again', async () => {
    render(<ToolStep {...props} input="{}" />);

    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
  });

  it('points the toggle at the panel it controls', () => {
    render(<ToolStep {...props} input="{}" />);

    expect(screen.getByRole('button')).toHaveAttribute('aria-controls');
  });

  it('labels the toggle with what it opens, not just a symbol', () => {
    render(<ToolStep {...props} input="{}" />);

    expect(screen.getByRole('button', { name: 'Show what search_docs did' })).toBeVisible();
  });

  it('offers no toggle when there is nothing to show', () => {
    render(<ToolStep {...props} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a busy indicator only while running', () => {
    const { rerender } = render(<ToolStep {...props} status="running" statusLabel="Running" />);

    expect(screen.getByRole('status')).toBeInTheDocument();

    rerender(<ToolStep {...props} status="done" statusLabel="Done" />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders an approval slot above the detail', () => {
    render(
      <ToolStep
        {...props}
        status="awaiting-approval"
        statusLabel="Needs approval"
        approval={<p>Create this ticket?</p>}
      />,
    );

    expect(screen.getByText('Create this ticket?')).toBeVisible();
  });
});
