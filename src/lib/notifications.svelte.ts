import { type Component } from 'svelte';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
    id: string;
    message: string;
    type: NotificationType;
    duration?: number;
}

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: 'danger' | 'warning' | 'info';
    onConfirm?: () => void;
    onCancel?: () => void;
}

class NotificationManager {
    toasts = $state<Toast[]>([]);
    confirmRequest = $state<ConfirmOptions & { resolve: (val: boolean) => void } | null>(null);

    addToast(message: string, type: NotificationType = 'success', duration = 4000) {
        const id = Math.random().toString(36).substring(2, 9);
        this.toasts.push({ id, message, type, duration });
        if (duration > 0) {
            setTimeout(() => this.removeToast(id), duration);
        }
    }

    removeToast(id: string) {
        this.toasts = this.toasts.filter(t => t.id !== id);
    }

    showConfirm(options: ConfirmOptions): Promise<boolean> {
        return new Promise((resolve) => {
            this.confirmRequest = {
                ...options,
                resolve
            };
        });
    }

    handleConfirm(value: boolean) {
        if (!this.confirmRequest) return;

        if (value) {
            this.confirmRequest.onConfirm?.();
        } else {
            this.confirmRequest.onCancel?.();
        }

        this.confirmRequest.resolve(value);
        this.confirmRequest = null;
    }
}

export const notifications = new NotificationManager();

export const toast = {
    success: (msg: string) => notifications.addToast(msg, 'success'),
    error: (msg: string) => notifications.addToast(msg, 'error'),
    info: (msg: string) => notifications.addToast(msg, 'info'),
    warning: (msg: string) => notifications.addToast(msg, 'warning'),
};

export const confirm = (optionsOrMessage: ConfirmOptions | string): Promise<boolean> => {
    if (typeof optionsOrMessage === 'string') {
        return notifications.showConfirm({
            title: 'Bestätigen',
            message: optionsOrMessage,
            type: 'warning'
        });
    }
    return notifications.showConfirm(optionsOrMessage);
};
