import { canTransition, releasesStock } from '../src/lib/orderStateMachine';

describe('order state machine', () => {
  it('allows the happy path', () => {
    expect(canTransition('PENDING_PAYMENT', 'PAID')).toBe(true);
    expect(canTransition('PAID', 'SHIPPED')).toBe(true);
    expect(canTransition('SHIPPED', 'DELIVERED')).toBe(true);
  });
  it('blocks illegal moves', () => {
    expect(canTransition('DELIVERED', 'CANCELLED')).toBe(false);
    expect(canTransition('EXPIRED', 'PAID')).toBe(false);
    expect(canTransition('SHIPPED', 'CANCELLED')).toBe(false);
  });
  it('restocks only on cancel or expire', () => {
    expect(releasesStock('CANCELLED')).toBe(true);
    expect(releasesStock('EXPIRED')).toBe(true);
    expect(releasesStock('PAID')).toBe(false);
  });
});
