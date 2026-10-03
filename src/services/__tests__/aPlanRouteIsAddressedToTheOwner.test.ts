import { routeAddressedToOwner } from '../taskPlans.service';

/** The tester's 1094 (32574): „I will look through Owner's own network". */
describe('a route named in the third person is addressed to the owner', () => {
  it('turns owner’s into your in English', () => {
    expect(routeAddressedToOwner("Owner's own network", 'en')).toBe('your own network');
    expect(routeAddressedToOwner('the owner’s contacts', 'en')).toBe('your contacts');
  });

  it('turns მფლობელის into შენი in Georgian', () => {
    expect(routeAddressedToOwner('მფლობელის ქსელი', 'ka')).toBe('შენი ქსელი');
  });

  it('leaves a route that does not name the owner as written', () => {
    expect(routeAddressedToOwner('Web-sourced distributors', 'en')).toBe(
      'Web-sourced distributors',
    );
  });
});
