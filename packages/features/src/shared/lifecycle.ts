export type ClientLifecycle = {
  isOnline: () => boolean;
  isVisible: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

export const defaultClientLifecycle: ClientLifecycle = {
  isOnline: () => true,
  isVisible: () => true,
  subscribe: () => () => {},
};
