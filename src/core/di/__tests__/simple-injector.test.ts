import { InjectionToken } from '../injection-token.js';
import { SimpleInjector } from '../simple-injector.js';
import { InjectionError } from '../../interfaces/errors.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

interface EventService {
  findAll(): string[];
}

interface UserService {
  getCurrentUser(): string;
}

const EVENT_SERVICE = new InjectionToken<EventService>('EventService');
const USER_SERVICE = new InjectionToken<UserService>('UserService');
const COUNTER = new InjectionToken<number>('Counter');

// ─── InjectionToken ───────────────────────────────────────────────────────────

describe('InjectionToken', () => {
  it('stores the description', () => {
    const token = new InjectionToken<string>('MyToken');
    expect(token.description).toBe('MyToken');
  });

  it('toString includes description', () => {
    const token = new InjectionToken<number>('Count');
    expect(token.toString()).toBe('InjectionToken(Count)');
  });

  it('two tokens with the same description are distinct', () => {
    const a = new InjectionToken<string>('same');
    const b = new InjectionToken<string>('same');
    const injector = new SimpleInjector();
    injector.bind(a, 'value-a');
    expect(injector.get(a)).toBe('value-a');
    expect(() => injector.get(b)).toThrow(InjectionError);
  });
});

// ─── SimpleInjector ───────────────────────────────────────────────────────────

describe('SimpleInjector', () => {
  let injector: SimpleInjector;

  beforeEach(() => {
    injector = new SimpleInjector();
  });

  it('bind() is fluent — returns this', () => {
    expect(injector.bind(COUNTER, 42)).toBe(injector);
  });

  it('get() returns the bound value', () => {
    injector.bind(COUNTER, 7);
    expect(injector.get(COUNTER)).toBe(7);
  });

  it('get() returns object references correctly', () => {
    const svc: EventService = { findAll: () => ['A'] };
    injector.bind(EVENT_SERVICE, svc);
    expect(injector.get(EVENT_SERVICE)).toBe(svc);
  });

  it('get() throws InjectionError for unregistered token', () => {
    expect(() => injector.get(COUNTER)).toThrow(InjectionError);
  });

  it('InjectionError.token references the missing token', () => {
    try {
      injector.get(EVENT_SERVICE);
      fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InjectionError);
      expect((err as InjectionError).token).toBe(EVENT_SERVICE);
    }
  });

  it('InjectionError message includes token description', () => {
    expect(() => injector.get(EVENT_SERVICE)).toThrow(/EventService/);
  });

  it('different tokens are independent', () => {
    injector.bind(COUNTER, 99);
    injector.bind(USER_SERVICE, { getCurrentUser: () => 'Alice' });
    expect(injector.get(COUNTER)).toBe(99);
    expect(injector.get(USER_SERVICE).getCurrentUser()).toBe('Alice');
  });

  it('rebinding a token replaces the previous value', () => {
    injector.bind(COUNTER, 1);
    injector.bind(COUNTER, 2);
    expect(injector.get(COUNTER)).toBe(2);
  });

  it('has() returns true for bound tokens', () => {
    injector.bind(COUNTER, 0);
    expect(injector.has(COUNTER)).toBe(true);
  });

  it('has() returns false for unbound tokens', () => {
    expect(injector.has(COUNTER)).toBe(false);
  });

  it('size reflects the number of bindings', () => {
    expect(injector.size).toBe(0);
    injector.bind(COUNTER, 1);
    expect(injector.size).toBe(1);
    injector.bind(USER_SERVICE, { getCurrentUser: () => '' });
    expect(injector.size).toBe(2);
  });

  it('size does not increase when rebinding the same token', () => {
    injector.bind(COUNTER, 1);
    injector.bind(COUNTER, 2);
    expect(injector.size).toBe(1);
  });

  it('chained bind() calls work', () => {
    injector
      .bind(COUNTER, 10)
      .bind(USER_SERVICE, { getCurrentUser: () => 'Bob' });
    expect(injector.get(COUNTER)).toBe(10);
    expect(injector.get(USER_SERVICE).getCurrentUser()).toBe('Bob');
  });
});
