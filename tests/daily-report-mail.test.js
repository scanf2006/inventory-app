jest.mock("../scripts/daily-report/supabase", () => {
  const rows = {};
  return {
    __rows: rows,
    readRow: async (id) => (rows[id] ? { data: rows[id] } : null),
    writeRow: async (id, data) => {
      rows[id] = data;
    },
  };
});

const supabase = require("../scripts/daily-report/supabase");
const mail = require("../scripts/daily-report/mail");

const KEY = mail.newTokenKey();
const email = { subject: "S", html: "<p>x</p>" };

// Fake Microsoft endpoints; records every call
const mockFetch = () => {
  const calls = [];
  global.fetch = jest.fn(async (url, opts = {}) => {
    const body = opts.body instanceof URLSearchParams ? Object.fromEntries(opts.body) : opts.body;
    calls.push({ url, body, headers: opts.headers });
    if (url.includes("/oauth2/v2.0/token")) {
      const json =
        body.grant_type === "refresh_token"
          ? { access_token: "user-access", refresh_token: "rt-2" }
          : { access_token: "app-access" };
      return { ok: true, status: 200, json: async () => json };
    }
    return { status: 202, text: async () => "" };
  });
  return calls;
};

afterEach(() => {
  delete global.fetch;
  Object.keys(supabase.__rows).forEach((k) => delete supabase.__rows[k]);
});

describe("token encryption", () => {
  test("round-trips and rejects the wrong key", () => {
    const sealed = mail.encrypt("secret-token", KEY);
    expect(sealed).not.toContain("secret-token");
    expect(mail.decrypt(sealed, KEY)).toBe("secret-token");
    expect(() => mail.decrypt(sealed, mail.newTokenKey())).toThrow();
  });
});

describe("sending", () => {
  const env = { MS_TENANT_ID: "t", MS_CLIENT_ID: "c", TOKEN_KEY: KEY, REPORT_TO: "a@x.com, b@x.com" };

  test("own account: refreshes the saved sign-in, stores the new one, sends from /me", async () => {
    await mail.saveRefreshToken("shop", "rt-1", KEY, "aiden@waycred.com");
    const calls = mockFetch();

    const to = await mail.sendMail(email, { syncId: "shop", env });

    expect(to).toEqual(["a@x.com", "b@x.com"]);
    expect(calls[0].body).toMatchObject({ grant_type: "refresh_token", refresh_token: "rt-1" });
    expect(calls[1].url).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
    expect(calls[1].headers.Authorization).toBe("Bearer user-access");
    const saved = supabase.__rows[mail.tokenRowId("shop")];
    expect(mail.decrypt(saved.token, KEY)).toBe("rt-2");
    expect(saved.account).toBe("aiden@waycred.com");
  });

  test("own account without a saved sign-in explains what to do", async () => {
    mockFetch();
    await expect(mail.sendMail(email, { syncId: "shop", env })).rejects.toThrow("authorize.js");
  });

  test("admin-approved app sends as MAIL_FROM", async () => {
    const calls = mockFetch();
    await mail.sendMail(email, {
      syncId: "shop",
      env: { ...env, TOKEN_KEY: "", MS_CLIENT_SECRET: "s", MAIL_FROM: "aiden@waycred.com" },
    });
    expect(calls[0].body).toMatchObject({ grant_type: "client_credentials" });
    expect(calls[1].url).toBe("https://graph.microsoft.com/v1.0/users/aiden%40waycred.com/sendMail");
  });
});
