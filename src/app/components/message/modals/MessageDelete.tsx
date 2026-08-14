import type { FormEventHandler, MouseEvent } from 'react';
import { useCallback, useEffect } from 'react';
import type { Room, MatrixEvent } from '$types/matrix-sdk';
import { useSetAtom } from 'jotai';
import {
  Box,
  Dialog,
  Header,
  IconButton,
  Text,
  Input,
  Button,
  Spinner,
  MenuItem,
  Tooltip,
  config,
  color,
} from 'folds';
import { menuIcon, Trash, X, Info } from '$components/icons/phosphor';
import { TooltipProvider } from '$components/overlay-stack';
import { useMatrixClient } from '$hooks/useMatrixClient';
import { AsyncStatus, useAsyncCallback } from '$hooks/useAsyncCallback';
import { modalAtom, ModalType } from '$state/modal';
import { useSetting } from '$state/hooks/settings';
import { settingsAtom } from '$state/settings';
import { showToast } from '$state/toast';
import * as css from '$features/room/message/styles.css';
import { createDebugLogger } from '$utils/debugLogger';
import * as Sentry from '@sentry/react';

const debugLog = createDebugLogger('MessageDelete');

export function MessageDeleteItem({
  room,
  mEvent,
  closeMenu,
}: {
  room: Room;
  mEvent: MatrixEvent;
  closeMenu?: () => void;
}) {
  const mx = useMatrixClient();
  const setModal = useSetAtom(modalAtom);
  const [shiftClickToInstaDelete] = useSetting(settingsAtom, 'shiftClickToInstaDelete');

  return (
    <MenuItem
      size="300"
      after={menuIcon(Trash)}
      radii="300"
      fill="None"
      variant="Critical"
      onClick={(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (shiftClickToInstaDelete && e.shiftKey) {
          const eventId = mEvent.getId();
          if (eventId) {
            debugLog.info('ui', 'Insta-deleting message', { roomId: room.roomId, eventId });
            mx.redactEvent(room.roomId, eventId).catch(() => {
              showToast('Failed to delete message! Please try again.');
            });
          }
          closeMenu?.();
          return;
        }
        setModal({
          type: ModalType.Delete,
          room,
          mEvent,
        });
        closeMenu?.();
      }}
    >
      <Text className={css.MessageMenuItemText} as="span" size="T300" truncate>
        Delete
      </Text>
    </MenuItem>
  );
}

type MessageDeleteInternalProps = {
  room: Room;
  mEvent: MatrixEvent;
  onClose: () => void;
};

export function MessageDeleteInternal({ room, mEvent, onClose }: MessageDeleteInternalProps) {
  const mx = useMatrixClient();
  const [shiftClickToInstaDelete] = useSetting(settingsAtom, 'shiftClickToInstaDelete');

  const [deleteState, deleteMessage] = useAsyncCallback(
    useCallback(
      (eventId: string, reason?: string) =>
        mx.redactEvent(room.roomId, eventId, undefined, reason ? { reason } : undefined),
      [mx, room]
    )
  );

  useEffect(() => {
    if (deleteState.status === AsyncStatus.Success) {
      debugLog.info('ui', 'Message deleted successfully', { roomId: room.roomId });
      Sentry.metrics.count('sable.message.delete.success', 1);
      onClose();
    }
    if (deleteState.status === AsyncStatus.Error) {
      debugLog.error('ui', 'Message delete failed', { roomId: room.roomId });
      Sentry.metrics.count('sable.message.delete.error', 1);
    }
  }, [deleteState.status, room.roomId, onClose]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    const eventId = mEvent.getId();
    if (
      !eventId ||
      deleteState.status === AsyncStatus.Loading ||
      deleteState.status === AsyncStatus.Success
    )
      return;

    const target = evt.target as HTMLFormElement | undefined;
    const reasonInput = target?.reasonInput as HTMLInputElement | undefined;
    const reason = reasonInput && reasonInput.value.trim();

    debugLog.info('ui', 'Deleting message', { eventId, hasReason: !!reason });
    Sentry.metrics.count('sable.message.delete.attempt', 1);
    deleteMessage(eventId, reason);
  };

  return (
    <Dialog variant="Surface">
      <Header
        style={{
          padding: `0 ${config.space.S200} 0 ${config.space.S400}`,
          borderBottomWidth: config.borderWidth.B300,
        }}
        variant="Surface"
        size="500"
      >
        <Box grow="Yes">
          <Text size="H4">Delete Message</Text>
        </Box>
        <IconButton size="300" onClick={onClose} radii="300">
          {menuIcon(X)}
        </IconButton>
      </Header>
      <Box
        as="form"
        onSubmit={handleSubmit}
        style={{ padding: config.space.S400 }}
        direction="Column"
        gap="400"
      >
        <Box direction="Column" gap="200">
          <Box gap="200" alignItems="Center">
            <Text priority="400">
              This action is irreversible! Are you sure that you want to delete this message?
            </Text>
            <TooltipProvider
              delay={400}
              position="Top"
              align="Center"
              tooltip={
                <Tooltip>
                  <Text size="T200">
                    {shiftClickToInstaDelete
                      ? 'Hold Shift and click Delete to delete instantly without this confirmation.'
                      : 'You can enable holding Shift to instantly delete messages in Settings.'}
                  </Text>
                </Tooltip>
              }
            >
              {(triggerRef) => (
                <IconButton
                  ref={triggerRef}
                  size="300"
                  radii="300"
                  type="button"
                  aria-label="Shift-click delete"
                  onClick={(e) => e.preventDefault()}
                >
                  {menuIcon(Info)}
                </IconButton>
              )}
            </TooltipProvider>
          </Box>
          <Box direction="Column" gap="100">
            <Text size="L400">
              Reason{' '}
              <Text as="span" size="T200">
                (optional)
              </Text>
            </Text>
            <Input name="reasonInput" variant="Background" />
            {deleteState.status === AsyncStatus.Error && (
              <Text style={{ color: color.Critical.Main }} size="T300">
                Failed to delete message! Please try again.
              </Text>
            )}
          </Box>
        </Box>
        <Button
          type="submit"
          variant="Critical"
          before={
            deleteState.status === AsyncStatus.Loading ? (
              <Spinner variant="Secondary" size="200" style={{ backgroundColor: 'transparent' }} />
            ) : undefined
          }
          aria-disabled={deleteState.status === AsyncStatus.Loading}
        >
          <Text size="B400">
            {deleteState.status === AsyncStatus.Loading ? 'Deleting...' : 'Delete'}
          </Text>
        </Button>
      </Box>
    </Dialog>
  );
}
