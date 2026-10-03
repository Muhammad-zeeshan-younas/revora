import { computed } from 'vue';
import type { Workspace } from '../../shared/schema';
import { customerAccounts } from '../../shared/finance';

export function useCustomerAccounts(workspace: () => Workspace) {
  const customersById = computed(
    () => new Map(workspace().customers.map((customer) => [customer.id, customer])),
  );
  const accounts = computed(() => customerAccounts(workspace()));

  function customerName(id: string): string {
    return customersById.value.get(id)?.name ?? 'Unidentified customer';
  }

  return { accounts, customersById, customerName };
}
