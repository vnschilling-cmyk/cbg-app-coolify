<script lang="ts">
    import { notifications } from "$lib/notifications.svelte";
    import Toast from "./Toast.svelte";
    import ConfirmationModal from "./ConfirmationModal.svelte";

    function handleConfirm() {
        notifications.handleConfirm(true);
    }

    function handleCancel() {
        notifications.handleConfirm(false);
    }

    function removeToast(id: string) {
        notifications.removeToast(id);
    }
</script>

<!-- Toasts Container -->
<div
    class="fixed bottom-6 right-6 z-[400] flex flex-col gap-3 pointer-events-none"
>
    {#each notifications.toasts as toast (toast.id)}
        <Toast {toast} onRemove={removeToast} />
    {/each}
</div>

<!-- Global Confirmation Modal -->
{#if notifications.confirmRequest}
    <ConfirmationModal
        open={true}
        title={notifications.confirmRequest.title}
        message={notifications.confirmRequest.message}
        confirmLabel={notifications.confirmRequest.confirmLabel}
        cancelLabel={notifications.confirmRequest.cancelLabel}
        type={notifications.confirmRequest.type}
        onConfirm={handleConfirm}
        onClose={handleCancel}
    />
{/if}
