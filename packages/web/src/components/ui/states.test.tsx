import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createConnectionStore } from '../../query/connection';
import type { QueryError, QueryStatus } from '../../query/query-client';
import { ConnectionProvider } from '../../query/use-connection';
import { ActionButton, ActionError, ConnectionBannerView, QueryBoundary, ReadError } from './index';

const query = (status: QueryStatus, over: { data?: unknown; error?: QueryError; refreshing?: boolean } = {}) => ({
  status,
  data: undefined as unknown,
  error: undefined as QueryError | undefined,
  refreshing: false,
  refetch: () => {},
  ...over,
});
const boundary = (q: ReturnType<typeof query>, label = 'staff list', size?: 'karigar') =>
  renderToStaticMarkup(
    <QueryBoundary label={label} query={q} size={size}>
      <p>No staff yet. Add the first person.</p>
    </QueryBoundary>,
  );
/** No state may use the 12 px class (text floor 14 px; 15 px on the karigar phone). */
const noSmallText = (html: string) => expect(html).not.toMatch(/\btext-(xs|\[1[0-3]px\])/);

describe('loading (S3)', () => {
  it('AC1 and AC4: shows a skeleton and a status line, and never the empty sentence', () => {
    const html = boundary(query('loading'));
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading the staff list…');
    expect(html).toContain('animate-pulse');
    expect(html).not.toContain('No staff yet');
    expect(html).toContain('text-sm');
    noSmallText(html);
  });
  it('AC4: the karigar size is 15 px', () => {
    const html = boundary(query('loading'), 'jobs', 'karigar');
    expect(html).toContain('Loading the jobs…');
    expect(html).toContain('text-[15px]');
    expect(html).not.toContain('text-sm');
  });
  it('AC2: each area has its own state, one ready while the other loads', () => {
    const html = renderToStaticMarkup(
      <>
        <QueryBoundary label="staff list" query={query('ready', { data: { items: [] } })}>
          <p>No staff yet. Add the first person.</p>
        </QueryBoundary>
        <QueryBoundary label="security log" query={query('loading')}>
          <p>No entries.</p>
        </QueryBoundary>
      </>,
    );
    expect(html).toContain('No staff yet');
    expect(html).toContain('Loading the security log…');
    expect(html).not.toContain('No entries.');
  });
  it('AC3: an empty list shows its empty sentence once ready', () => {
    expect(boundary(query('ready', { data: { items: [] } }))).toContain('No staff yet. Add the first person.');
  });
  it('AC5: data held while refreshing shows the data, with no loading line', () => {
    const html = boundary(query('ready', { data: { items: [1] }, refreshing: true }));
    expect(html).toContain('No staff yet');
    expect(html).not.toContain('Loading the');
  });
  it('a custom skeleton replaces the grey bars but keeps the status line', () => {
    const html = renderToStaticMarkup(
      <QueryBoundary label="card" query={query('loading')} loading={<div data-skeleton />}>
        x
      </QueryBoundary>,
    );
    expect(html).toContain('data-skeleton');
    expect(html).toContain('Loading the card…');
  });
});

describe('read errors (S4)', () => {
  it('AC1: shows the server sentence with Try again, as an alert with an icon', () => {
    const html = boundary(query('failed', { error: { code: 'internal', message: 'The staff list could not be read.' } }));
    expect(html).toContain('role="alert"');
    expect(html).toContain('The staff list could not be read.');
    expect(html).toContain('Try again');
    expect(html).toContain('<svg');
    expect(html).not.toContain('No staff yet');
    noSmallText(html);
  });
  it('AC1: the area says what could not be loaded, then the server sentence', () => {
    const html = boundary(query('failed', { error: { code: 'internal', message: 'Cannot reach the server.' } }), 'security log');
    expect(html).toContain('The security log could not be loaded. Cannot reach the server.');
  });
  it('AC4: a refused read says so and has no Try again', () => {
    const html = boundary(query('failed', { error: { code: 'forbidden', message: 'Your role may not run this.' } }));
    expect(html).toContain('You may not see this.');
    expect(html).not.toContain('Try again');
  });
  it('AC3: one area failing leaves the other untouched', () => {
    const html = renderToStaticMarkup(
      <>
        <QueryBoundary label="cards" query={query('failed', { error: { code: 'internal', message: 'Cards failed.' } })}>
          <p>cards</p>
        </QueryBoundary>
        <QueryBoundary label="log" query={query('ready', { data: [] })}>
          <p>log is fine</p>
        </QueryBoundary>
      </>,
    );
    expect(html).toContain('Cards failed.');
    expect(html).toContain('log is fine');
  });
  it('keeps showing the data held when a refresh fails, under the error', () => {
    const html = boundary(query('failed', { data: { items: [1] }, error: { code: 'internal', message: 'Could not refresh.' } }));
    expect(html.indexOf('Could not refresh.')).toBeLessThan(html.indexOf('No staff yet'));
  });
  it('a retry in progress disables the button', () => {
    const html = renderToStaticMarkup(<ReadError message="Down." code="internal" onRetry={() => {}} busy />);
    expect(html).toContain('Trying again…');
    expect(html).toContain(' disabled=""');
  });
  it('S11 AC2: data that may be out of date is marked with text and an icon, never colour alone', () => {
    const html = boundary(query('possibly_stale', { data: { items: [1] } }));
    expect(html).toContain('Possibly out of date');
    expect(html).toContain('<svg');
    expect(html).toContain('No staff yet');
    noSmallText(html);
  });
});

describe('action outcome (S5, S6)', () => {
  it('S5 AC1: the refusal sentence is an alert beside the action', () => {
    const html = renderToStaticMarkup(<ActionError refusal={{ message: 'TAG-8841 is not in stock.' }} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('TAG-8841 is not in stock.');
    expect(html).not.toContain('Try again');
    noSmallText(html);
  });
  it('S6 AC1: a lost connection says it may not have been saved and offers Try again', () => {
    const html = renderToStaticMarkup(<ActionError refusal={null} maybeNotSaved onRetry={() => {}} />);
    expect(html).toContain('It may not have been saved. Check the connection and try again.');
    expect(html).toContain('Try again');
  });
  it('shows nothing when there is nothing to say', () => {
    expect(renderToStaticMarkup(<ActionError refusal={null} />)).toBe('');
  });
});

describe('the action button (S5, S11 AC1)', () => {
  const blocked = () => {
    const store = createConnectionStore({ windowLike: null });
    store.setLiveStatus('reconnecting');
    return store;
  };
  it('is enabled and shows its label when idle and connected', () => {
    const html = renderToStaticMarkup(<ActionButton>Save</ActionButton>);
    expect(html).toContain('>Save<');
    expect(html).not.toContain(' disabled=""');
    expect(html).not.toContain('aria-describedby');
  });
  it('shows Working… and is disabled while busy', () => {
    const html = renderToStaticMarkup(<ActionButton busy>Save</ActionButton>);
    expect(html).toContain('Working…');
    expect(html).toContain(' disabled=""');
  });
  it('S11 AC1: while the connection blocks actions it is disabled and the reason is linked and at least 14 px', () => {
    const html = renderToStaticMarkup(
      <ConnectionProvider store={blocked()}>
        <ActionButton>Save</ActionButton>
      </ConnectionProvider>,
    );
    expect(html).toContain(' disabled=""');
    expect(html).toContain('Reconnecting to the server. Try again when the connection is back.');
    const id = /aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('text-sm');
    noSmallText(html);
  });
  it('a reason of the form itself disables it and is shown the same way', () => {
    const html = renderToStaticMarkup(<ActionButton disabledReason="Enter a phone number first.">Add</ActionButton>);
    expect(html).toContain(' disabled=""');
    expect(html).toContain('Enter a phone number first.');
    expect(html).toContain('aria-describedby');
  });
});

describe('connection banner (S10 AC5, S11 AC1)', () => {
  it('reconnecting: a polite status with a spinner icon and text', () => {
    const html = renderToStaticMarkup(<ConnectionBannerView state="reconnecting" recovered={false} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('Reconnecting…');
    expect(html).toContain('animate-spin');
    noSmallText(html);
  });
  it('offline: the sentence about changes needing the server, with an icon', () => {
    const html = renderToStaticMarkup(<ConnectionBannerView state="offline" recovered={false} />);
    expect(html).toContain('You are offline. What you see may be out of date. Changes need the server.');
    expect(html).toContain('<svg');
  });
  it('back again: a visually hidden "Connected again."', () => {
    const html = renderToStaticMarkup(<ConnectionBannerView state="connected" recovered />);
    expect(html).toContain('sr-only');
    expect(html).toContain('Connected again.');
  });
  it('connected and never broken: an empty live region', () => {
    const html = renderToStaticMarkup(<ConnectionBannerView state="connected" recovered={false} />);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('Connected again.');
    expect(html).not.toContain('Reconnecting');
  });
});
