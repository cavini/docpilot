import { detectLanguage } from './language.js';

describe('detectLanguage', () => {
  it('AC1: detects English technical prose', () => {
    const text =
      'The request returns a bearer token which you should send with every call. ' +
      'This token will expire after one hour and must then be refreshed.';

    expect(detectLanguage(text)).toBe('english');
  });

  it('AC2: detects Portuguese technical prose', () => {
    const text =
      'A requisição retorna um token que você deve enviar com cada chamada. ' +
      'Este token não é permanente e será renovado após uma hora.';

    expect(detectLanguage(text)).toBe('portuguese');
  });

  it('AC3: is not fooled by code in an English document', () => {
    const text = [
      'The endpoint returns a token. Send it with every request that follows.',
      '```ts',
      'const naoUsado = 1;',
      'const pela = 2;',
      '```',
    ].join('\n');

    expect(detectLanguage(text)).toBe('english');
  });

  it('AC4: uses accents as evidence for a short Portuguese document', () => {
    expect(detectLanguage('Autenticação e autorização')).toBe('portuguese');
  });

  it('AC5: defaults to English for empty text', () => {
    expect(detectLanguage('')).toBe('english');
    expect(detectLanguage('   \n  ')).toBe('english');
  });

  it('AC6: defaults to English for text with no marker words', () => {
    expect(detectLanguage('token endpoint payload')).toBe('english');
  });

  it('AC7: is deterministic', () => {
    const text = 'A autenticação exige um cabeçalho de autorização em cada requisição.';

    expect(detectLanguage(text)).toBe(detectLanguage(text));
  });

  it('AC8: handles a long document without scanning all of it', () => {
    const long = 'The request returns a token. '.repeat(20_000);

    const started = Date.now();
    expect(detectLanguage(long)).toBe('english');
    expect(Date.now() - started).toBeLessThan(500);
  });
});
