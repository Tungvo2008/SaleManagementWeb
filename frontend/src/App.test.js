import { act, render, screen } from '@testing-library/react';
import App from './App';

test('renders POS page', async () => {
  window.location.hash = "#/pos"
  global.fetch = jest.fn(async (url) => {
    const u = String(url)
    if (u.includes('/auth/me')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ id: 1, username: "admin", role: "admin" }),
      }
    }
    if (u.includes('/pos/orders/?status=draft') || u.includes('/pos/orders?status=draft')) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify([]),
      }
    }
    if (u.includes('/receipt')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            order_id: 1,
            status: 'draft',
            created_at: new Date().toISOString(),
            items: [],
            subtotal: '0',
            discount_total: '0',
            grand_total: '0',
          }),
      }
    }
    if (u.includes('/pos/orders')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: 1,
            status: 'draft',
            note: null,
            subtotal: '0',
            discount_total: '0',
            grand_total: '0',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            payment_method: null,
            paid_amount: null,
            change_amount: null,
            checked_out_at: null,
          }),
      }
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({}) }
  })

  await act(async () => {
    render(<App />);
  })
  expect(await screen.findByText(/POS bán hàng/i)).toBeInTheDocument();
});
