"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef, type ReactNode } from "react";
export function PublicDialog({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
  className = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal
        container={
          typeof document === "undefined"
            ? undefined
            : document.querySelector<HTMLElement>(".public-site") || undefined
        }
      >
        <Dialog.Overlay className="public-dialog-overlay" />
        <Dialog.Content
          className={`public-dialog ${className}`}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            returnFocus.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            if (returnFocus.current?.isConnected) {
              event.preventDefault();
              returnFocus.current.focus({ preventScroll: true });
            }
          }}
        >
          <Dialog.Title className="public-dialog-title">{title}</Dialog.Title>
          <Dialog.Close
            className="public-icon-button public-dialog-close"
            aria-label={closeLabel}
          >
            <X size={22} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
