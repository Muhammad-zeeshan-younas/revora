export enum AuthMode {
  Login = 'login',
  Invite = 'invite',
}

export enum RecordSort {
  Name = 'name',
  Balance = 'balance',
}

export enum PageId {
  Overview = 'overview',
  Customers = 'customers',
  Invoices = 'invoices',
  Collections = 'collections',
  Payments = 'payments',
  Credit = 'credit',
  Activity = 'activity',
  Settings = 'settings',
}

export enum ActionKind {
  Customer = 'customer',
  Invoice = 'invoice',
  Payment = 'payment',
  Import = 'import',
  Profile = 'profile',
  Interaction = 'interaction',
  Promise = 'promise',
  Credit = 'credit',
  Match = 'match',
  Reverse = 'reverse',
  Dispute = 'dispute',
  Invite = 'invite',
  Help = 'help',
}
