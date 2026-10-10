// Toasts load sonner on first use so the renderer stays out of every route's first-load bundle.
type Msg = string;
const lib = () => import('sonner').then((m) => m.toast);
export const toast = {
  success: (m: Msg) => void lib().then((t) => t.success(m)),
  error: (m: Msg) => void lib().then((t) => t.error(m)),
  info: (m: Msg) => void lib().then((t) => t.info(m)),
  message: (m: Msg) => void lib().then((t) => t.message(m)),
};
