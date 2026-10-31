import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MessageBubble } from './message-bubble';

describe('MessageBubble', () => {
  it('names the author as text, not only by alignment and colour', () => {
    // A transcript conveyed only by layout reads as one undifferentiated run
    // of text to a screen reader.
    render(
      <MessageBubble author="assistant" authorLabel="DocPilot">
        An answer
      </MessageBubble>,
    );

    expect(screen.getByText('DocPilot')).toBeVisible();
  });

  it('renders the message content', () => {
    render(
      <MessageBubble author="user" authorLabel="You">
        How do I authenticate?
      </MessageBubble>,
    );

    expect(screen.getByText('How do I authenticate?')).toBeVisible();
  });

  it('renders a footer when given one', () => {
    render(
      <MessageBubble author="assistant" authorLabel="DocPilot" footer="Stopped">
        A partial answer
      </MessageBubble>,
    );

    expect(screen.getByText('Stopped')).toBeVisible();
  });

  it('renders no footer element when there is none', () => {
    render(
      <MessageBubble author="assistant" authorLabel="DocPilot">
        An answer
      </MessageBubble>,
    );

    expect(screen.queryByText('Stopped')).toBeNull();
  });
});
