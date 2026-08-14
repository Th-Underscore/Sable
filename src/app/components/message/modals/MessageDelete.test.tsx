import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider, createStore, useAtomValue } from 'jotai';
import type { Room, MatrixEvent, MatrixClient } from '$types/matrix-sdk';
import { MatrixClientProvider } from '$hooks/useMatrixClient';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { modalAtom, ModalType } from '$state/modal';
import { MessageDeleteItem } from './MessageDelete';

function createFakes() {
  const mx = { redactEvent: vi.fn<() => Promise<unknown>>().mockResolvedValue({}) };
  const room = { roomId: '!room:example.com' } as unknown as Room;
  const mEvent = { getId: () => '$event:example.com' } as unknown as MatrixEvent;
  return { mx, room, mEvent };
}

function EnableShiftSetting() {
  const [, setShift] = useSetting(settingsAtom, 'shiftClickToInstaDelete');
  return (
    <button type="button" onClick={() => setShift(true)}>
      Enable
    </button>
  );
}

function ModalReader() {
  const modal = useAtomValue(modalAtom);
  return <span data-testid="modal">{modal ? modal.type : 'none'}</span>;
}

function renderItem() {
  const store = createStore();
  const { mx, room, mEvent } = createFakes();
  render(
    <Provider store={store}>
      <MatrixClientProvider value={mx as unknown as MatrixClient}>
        <EnableShiftSetting />
        <ModalReader />
        <MessageDeleteItem room={room} mEvent={mEvent} closeMenu={() => {}} />
      </MatrixClientProvider>
    </Provider>
  );
  return { mx, room, mEvent };
}

describe('MessageDeleteItem', () => {
  it('opens the confirm dialog without redacting when the feature is off (default)', () => {
    const { mx } = renderItem();
    fireEvent.click(screen.getByText('Delete'));
    expect(mx.redactEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId('modal').textContent).toBe(ModalType.Delete);
  });

  it('still opens the confirm dialog on shift-click while the feature is off', () => {
    const { mx } = renderItem();
    fireEvent.click(screen.getByText('Delete'), { shiftKey: true });
    expect(mx.redactEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId('modal').textContent).toBe(ModalType.Delete);
  });

  it('redacts instantly on shift-click when the feature is enabled', () => {
    const { mx } = renderItem();
    fireEvent.click(screen.getByText('Enable'));
    fireEvent.click(screen.getByText('Delete'), { shiftKey: true });
    expect(mx.redactEvent).toHaveBeenCalledWith('!room:example.com', '$event:example.com');
    expect(screen.getByTestId('modal').textContent).toBe('none');
  });

  it('opens the confirm dialog on a plain click while the feature is enabled', () => {
    const { mx } = renderItem();
    fireEvent.click(screen.getByText('Enable'));
    fireEvent.click(screen.getByText('Delete'));
    expect(mx.redactEvent).not.toHaveBeenCalled();
    expect(screen.getByTestId('modal').textContent).toBe(ModalType.Delete);
  });
});
