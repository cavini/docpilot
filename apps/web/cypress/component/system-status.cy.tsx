import { SystemStatus } from '@/components/system-status';

const healthy = {
  status: 'ok',
  version: '0.0.0',
  uptimeSeconds: 12,
  checkedAt: '2026-10-30T12:00:00.000Z',
  dependencies: {
    database: { status: 'ok', latencyMs: 3 },
    redis: { status: 'ok', latencyMs: 1 },
    storage: { status: 'ok', latencyMs: 8 },
  },
};

describe('SystemStatus in a real browser', () => {
  it('AC1: renders every dependency once the API answers', () => {
    cy.intercept('GET', '**/health', { statusCode: 200, body: healthy }).as('health');

    cy.mountWithProviders(<SystemStatus />);

    cy.wait('@health');
    cy.contains('Database').should('be.visible');
    cy.contains('Redis').should('be.visible');
    cy.contains('Storage').should('be.visible');
  });

  it('AC2: shows a failing dependency differently from a healthy one', () => {
    cy.intercept('GET', '**/health', {
      statusCode: 503,
      body: {
        ...healthy,
        status: 'down',
        dependencies: { ...healthy.dependencies, redis: { status: 'down', error: 'refused' } },
      },
    }).as('health');

    cy.mountWithProviders(<SystemStatus />);

    cy.wait('@health');
    cy.contains('Unavailable').should('be.visible');
    cy.contains('Operational').should('be.visible');
  });

  it('AC3: states the status in text, so it does not rely on colour alone', () => {
    cy.intercept('GET', '**/health', { statusCode: 200, body: healthy }).as('health');

    cy.mountWithProviders(<SystemStatus />);

    cy.wait('@health');
    // Four rows: overall plus each dependency.
    cy.contains('Operational').should('be.visible');
    cy.get('li').should('have.length', 4);
  });

  it('AC4: tells the reader what to do when the API cannot be reached', () => {
    cy.intercept('GET', '**/health', { forceNetworkError: true }).as('health');

    cy.mountWithProviders(<SystemStatus />);

    cy.contains('The API is not reachable').should('be.visible');
  });
});
