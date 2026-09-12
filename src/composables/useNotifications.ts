import { ref } from 'vue';

export const toast = ref('');

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function notify(message: string): void {
  toast.value = message;
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    toast.value = '';
  }, 5000);
}
