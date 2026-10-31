import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Dropzone } from './dropzone';

const props = {
  accept: '.pdf,.md,.txt',
  label: 'Drop a document here',
  inputLabel: 'Choose a document',
};

const file = (name = 'guide.md'): File => new File(['# Guide'], name, { type: 'text/markdown' });

describe('Dropzone', () => {
  it('AC3: emits the file chosen through the picker', async () => {
    const onFiles = vi.fn();
    render(<Dropzone {...props} onFiles={onFiles} />);

    await userEvent.upload(screen.getByLabelText('Choose a document'), file());

    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'guide.md' })]);
  });

  it('AC2: emits files dropped on the zone', () => {
    const onFiles = vi.fn();
    render(<Dropzone {...props} onFiles={onFiles} />);

    fireEvent.drop(screen.getByText('Drop a document here'), {
      dataTransfer: { files: [file()] },
    });

    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it('emits both files when two are dropped at once', () => {
    const onFiles = vi.fn();
    render(<Dropzone {...props} onFiles={onFiles} />);

    fireEvent.drop(screen.getByText('Drop a document here'), {
      dataTransfer: { files: [file('a.md'), file('b.md')] },
    });

    expect(onFiles.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('does not call the handler for an empty drop', () => {
    const onFiles = vi.fn();
    render(<Dropzone {...props} onFiles={onFiles} />);

    fireEvent.drop(screen.getByText('Drop a document here'), { dataTransfer: { files: [] } });

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('AC13: marks itself as accepting while a drag is over it', () => {
    render(<Dropzone {...props} onFiles={vi.fn()} />);
    const zone = screen.getByText('Drop a document here').parentElement;

    expect(zone).not.toHaveAttribute('data-over');

    fireEvent.dragEnter(zone as Element);

    expect(zone).toHaveAttribute('data-over', 'true');
  });

  it('AC13: stays marked when the pointer crosses into a child element', () => {
    // dragleave fires on every boundary crossing inside the zone, so a boolean
    // flag flickers off while the pointer is still inside it.
    render(<Dropzone {...props} onFiles={vi.fn()} hint="PDF, Markdown or text" />);
    const zone = screen.getByText('Drop a document here').parentElement as Element;
    const child = screen.getByText('PDF, Markdown or text');

    fireEvent.dragEnter(zone);
    fireEvent.dragEnter(child);
    fireEvent.dragLeave(child);

    expect(zone).toHaveAttribute('data-over', 'true');
  });

  it('AC13: stops being marked once the drag leaves the zone itself', () => {
    render(<Dropzone {...props} onFiles={vi.fn()} />);
    const zone = screen.getByText('Drop a document here').parentElement as Element;

    fireEvent.dragEnter(zone);
    fireEvent.dragLeave(zone);

    expect(zone).not.toHaveAttribute('data-over');
  });

  it('ignores a drop while disabled', () => {
    const onFiles = vi.fn();
    render(<Dropzone {...props} onFiles={onFiles} disabled />);

    fireEvent.drop(screen.getByText('Drop a document here'), {
      dataTransfer: { files: [file()] },
    });

    expect(onFiles).not.toHaveBeenCalled();
  });

  it('keeps the file input focusable, so the zone works without a mouse', () => {
    render(<Dropzone {...props} onFiles={vi.fn()} />);
    const input = screen.getByLabelText('Choose a document');

    input.focus();

    expect(input).toHaveFocus();
  });

  it('passes accept through, so the picker filters by type', () => {
    render(<Dropzone {...props} onFiles={vi.fn()} />);

    expect(screen.getByLabelText('Choose a document')).toHaveAttribute('accept', '.pdf,.md,.txt');
  });
});
