const $ = id => document.getElementById(id);

let sb = null;
let user = null;
let profile = null;
let org = null;
let myMembership = null;

let members = [];
let trucks = [];
let loads = [];
let issues = [];
let tasks = [];
let cases = [];
let learning = [];
let activity = [];
let loadDocuments = [];

let currentPanel = 'dashboard';

let heartbeatTimer = null;
let adminRefreshTimer = null;

const ADMIN_REFRESH_MS = 8000;
const HEARTBEAT_MS = 25000;
const ONLINE_WINDOW_MS = 75000;


/* ============================================================
   HELPERS
============================================================ */

const money = n =>
  '$' +
  Number(n || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0
  });


const esc = s =>
  String(s ?? '').replace(
    /[&<>'"]/g,
    c =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[c])
  );


const fmt = d =>
  d
    ? new Date(d).toLocaleString()
    : '—';


const roleLabel = r =>
  r === 'admin'
    ? '👑 Admin'
    : r === 'trainer'
    ? '🎓 Trainer'
    : '🚛 Dispatcher';


const toast = msg => {

  const el = $('toast');

  if (!el) return;

  el.textContent = msg;
  el.classList.add('show');

  clearTimeout(toast.t);

  toast.t = setTimeout(
    () => el.classList.remove('show'),
    2600
  );
};


function setSync(text) {

  const el = $('syncStatus');

  if (el) {
    el.textContent = text;
  }
}


/* ============================================================
   THEME
============================================================ */

function setupTheme() {

  const saved =
    localStorage.getItem('dispatchos.theme') ||
    'midnight';

  document.documentElement.dataset.theme =
    saved;

  $('paletteSelect').value =
    saved;

  $('paletteSelect')
    .addEventListener(
      'change',
      e => {

        document.documentElement.dataset.theme =
          e.target.value;

        localStorage.setItem(
          'dispatchos.theme',
          e.target.value
        );
      }
    );
}


/* ============================================================
   UI SETUP
============================================================ */

function setupUI() {

  document
    .querySelectorAll('.auth-tab')
    .forEach(button => {

      button.addEventListener(
        'click',
        () => {

          document
            .querySelectorAll('.auth-tab')
            .forEach(
              x =>
                x.classList.remove(
                  'active'
                )
            );

          document
            .querySelectorAll('.auth-form')
            .forEach(
              x =>
                x.classList.remove(
                  'active'
                )
            );

          button.classList.add(
            'active'
          );

          $(
            button.dataset.auth +
              'Form'
          ).classList.add(
            'active'
          );
        }
      );
    });


  document
    .querySelectorAll(
      '[data-toggle]'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        () =>
          $(
            button.dataset.toggle
          ).classList.toggle(
            'hidden'
          )
      );
    });


  document
    .querySelectorAll(
      '.nav-btn'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        () =>
          showPanel(
            button.dataset.panel
          )
      );
    });


  document
    .querySelectorAll(
      '.jump'
    )
    .forEach(button => {

      button.addEventListener(
        'click',
        () =>
          showPanel(
            button.dataset.jump
          )
      );
    });


  $('refreshBtn')
    .addEventListener(
      'click',
      async () => {

        await loadWorkspaceData();

        toast(
          '🔄 Workspace refreshed'
        );
      }
    );


  $('logoutBtn')
    .addEventListener(
      'click',
      logout
    );


  $('gateLogout')
    .addEventListener(
      'click',
      logout
    );


  $('copyCode')
    .addEventListener(
      'click',
      async () => {

        try {

          await navigator.clipboard
            .writeText(
              org.invite_code
            );

          toast(
            'Team code copied'
          );

        } catch {

          toast(
            'Team code: ' +
            org.invite_code
          );
        }
      }
    );


  const adminRefresh =
    $('adminRefreshNow');

  if (adminRefresh) {

    adminRefresh
      .addEventListener(
        'click',
        async () => {

          adminRefresh.disabled =
            true;

          adminRefresh.textContent =
            '⏳ Refreshing…';

          await refreshAdminLive();

          adminRefresh.disabled =
            false;

          adminRefresh.textContent =
            '↻ Refresh now';

          toast(
            '📡 Admin view refreshed'
          );
        }
      );
  }
}


/* ============================================================
   PANELS
============================================================ */

async function showPanel(id) {

  currentPanel = id;


  document
    .querySelectorAll(
      '.nav-btn'
    )
    .forEach(button => {

      button.classList.toggle(
        'active',
        button.dataset.panel ===
          id
      );
    });


  document
    .querySelectorAll(
      '.panel'
    )
    .forEach(panel => {

      panel.classList.toggle(
        'active-panel',
        panel.id === id
      );
    });


  const titles = {

    dashboard: [
      'LIVE OPERATIONS',
      'Command Dashboard'
    ],

    fleet: [
      'SHARED FLEET',
      'Fleet Control'
    ],

    loads: [
      'LOAD OPERATIONS',
      'Load Desk'
    ],

    issues: [
      'SERVICE RECOVERY',
      'Issue Desk'
    ],

    tasks: [
      'PRIVATE WORKSPACE',
      'My Tasks'
    ],

    cases: [
      'KNOWLEDGE SYSTEM',
      'Case Library'
    ],

    learning: [
      'SKILL DEVELOPMENT',
      'Learning Center'
    ],

    team: [
      'COMPANY',
      'Team Members'
    ],

    admin: [
      'ADMIN ONLY',
      'Admin Control Center'
    ],

    activity: [
      'AUDIT TRAIL',
      'Workspace Activity'
    ]

  };


  $('pageEyebrow')
    .textContent =
      titles[id][0];

  $('pageTitle')
    .textContent =
      titles[id][1];


  if (
    id === 'admin' &&
    myMembership?.role ===
      'admin'
  ) {

    await refreshAdminLive();
  }
}


/* ============================================================
   INITIALIZE
============================================================ */

async function init() {

  setupTheme();
  setupUI();

  const url =
    window.DISPATCHOS_SUPABASE_URL;

  const key =
    window.DISPATCHOS_SUPABASE_ANON_KEY;


  if (
    !url ||
    !key ||
    url.includes('PASTE_') ||
    key.includes('PASTE_') ||
    !window.supabase
  ) {

    $('setupWarning')
      .classList.remove(
        'hidden'
      );

    return;
  }


  sb =
    window.supabase.createClient(
      url,
      key
    );


  const {
    data: { session }
  } =
    await sb.auth.getSession();


  if (session?.user) {

    await afterLogin(
      session.user
    );
  }


  sb.auth.onAuthStateChange(
    async (
      event,
      session
    ) => {

      if (
        event === 'SIGNED_IN' &&
        session?.user &&
        session.user.id !==
          user?.id
      ) {

        await afterLogin(
          session.user
        );
      }


      if (
        event === 'SIGNED_OUT'
      ) {

        showAuth();
      }
    }
  );
}


/* ============================================================
   AUTH / PROFILE
============================================================ */

async function afterLogin(u) {

  user = u;

  setSync(
    '☁️ Connected'
  );

  await ensureProfile();

  const membership =
    await getMembership();


  if (!membership) {

    $('authScreen')
      .classList.add(
        'hidden'
      );

    $('workspaceGate')
      .classList.remove(
        'hidden'
      );

    $('app')
      .classList.add(
        'hidden'
      );

    return;
  }


  myMembership =
    membership;

  await loadOrg();

  showApp();

  await loadWorkspaceData();

  startHeartbeat();

  startAdminAutoRefresh();
}


function showAuth() {

  stopLiveTimers();

  $('authScreen')
    .classList.remove(
      'hidden'
    );

  $('workspaceGate')
    .classList.add(
      'hidden'
    );

  $('app')
    .classList.add(
      'hidden'
    );

  user = null;
  profile = null;
  org = null;
  myMembership = null;

  members = [];
  trucks = [];
  loads = [];
  issues = [];
  tasks = [];
  cases = [];
  learning = [];
  activity = [];
  loadDocuments = [];
}


async function ensureProfile() {

  let {
    data,
    error
  } =
    await sb
      .from('profiles')
      .select('*')
      .eq(
        'id',
        user.id
      )
      .maybeSingle();


  if (error) {

    console.error(
      'Profile load error:',
      error
    );
  }


  if (!data) {

    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          500
        )
    );


    const result =
      await sb
        .from('profiles')
        .select('*')
        .eq(
          'id',
          user.id
        )
        .maybeSingle();


    data =
      result.data;
  }


  if (!data) {

    const displayName =
      user.user_metadata
        ?.display_name ||
      user.email
        .split('@')[0];


    const created =
      await sb
        .from('profiles')
        .upsert({
          id: user.id,
          display_name:
            displayName,
          xp: 0,
          shift_active:
            false,
          last_seen:
            new Date()
              .toISOString()
        })
        .select()
        .single();


    if (!created.error) {

      data =
        created.data;
    }
  }


  profile =
    data || {
      display_name:
        user.user_metadata
          ?.display_name ||
        user.email.split(
          '@'
        )[0],
      xp: 0,
      shift_active:
        false,
      last_seen: null
    };
}


async function getMembership() {

  const {
    data,
    error
  } =
    await sb
      .from(
        'organization_members'
      )
      .select('*')
      .eq(
        'user_id',
        user.id
      )
      .eq(
        'status',
        'active'
      )
      .limit(1)
      .maybeSingle();


  if (error) {

    console.error(
      'Membership error:',
      error
    );
  }


  return data;
}


async function loadOrg() {

  const {
    data,
    error
  } =
    await sb
      .from(
        'organizations'
      )
      .select('*')
      .eq(
        'id',
        myMembership.org_id
      )
      .single();


  if (error) {
    throw error;
  }


  org = data;
}


function showApp() {

  $('authScreen')
    .classList.add(
      'hidden'
    );

  $('workspaceGate')
    .classList.add(
      'hidden'
    );

  $('app')
    .classList.remove(
      'hidden'
    );


  $('orgNameDisplay')
    .textContent =
      org.name;


  $('userName')
    .textContent =
      profile.display_name;


  $('userRole')
    .textContent =
      roleLabel(
        myMembership.role
      );


  $('userAvatar')
    .textContent =
      (
        profile.display_name ||
        'D'
      )[0]
        .toUpperCase();


  $('teamCode')
    .textContent =
      org.invite_code;


  document
    .querySelectorAll(
      '.admin-only'
    )
    .forEach(
      el =>
        el.classList.toggle(
          'hidden',
          myMembership.role !==
            'admin'
        )
    );


  document
    .querySelectorAll(
      '.admin-dispatcher'
    )
    .forEach(
      el =>
        el.classList.toggle(
          'hidden',
          ![
            'admin',
            'dispatcher'
          ].includes(
            myMembership.role
          )
        )
    );


  renderShift();
}


/* ============================================================
   AUTH FORMS
============================================================ */

$('loginForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      $('authMessage')
        .textContent =
          'Signing in…';


      const {
        error
      } =
        await sb.auth
          .signInWithPassword({
            email:
              $('loginEmail')
                .value.trim(),

            password:
              $('loginPassword')
                .value
          });


      $('authMessage')
        .textContent =
          error
            ? '❌ ' +
              error.message
            : '✅ Signed in';
    }
  );


$('signupForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      $('authMessage')
        .textContent =
          'Creating account…';


      const {
        data,
        error
      } =
        await sb.auth.signUp({

          email:
            $('signupEmail')
              .value.trim(),

          password:
            $('signupPassword')
              .value,

          options: {

            data: {

              display_name:
                $('signupName')
                  .value.trim()
            }
          }
        });


      if (error) {

        $('authMessage')
          .textContent =
            '❌ ' +
            error.message;

        return;
      }


      $('authMessage')
        .textContent =
          data.session
            ? '✅ Account created.'
            : '📧 Account created. Log in to continue.';
    }
  );


$('createOrgForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      const {
        error
      } =
        await sb.rpc(
          'create_organization',
          {
            p_name:
              $('orgName')
                .value.trim()
          }
        );


      if (error) {

        toast(
          '❌ ' +
          error.message
        );

        return;
      }


      myMembership =
        await getMembership();

      await loadOrg();

      showApp();

      await loadWorkspaceData();

      startHeartbeat();

      startAdminAutoRefresh();

      toast(
        '👑 Workspace created'
      );
    }
  );
$('joinOrgForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      const {
        error
      } =
        await sb.rpc(
          'join_organization',
          {
            p_invite_code:
              $('joinCode')
                .value
                .trim()
                .toUpperCase()
          }
        );


      if (error) {

        toast(
          '❌ ' +
          error.message
        );

        return;
      }


      myMembership =
        await getMembership();

      await loadOrg();

      showApp();

      await loadWorkspaceData();

      startHeartbeat();

      startAdminAutoRefresh();

      toast(
        '🚛 Joined ' +
        org.name
      );
    }
  );


async function logout() {

  stopLiveTimers();

  if (sb) {
    await sb.auth.signOut();
  }
}


/* ============================================================
   MEMBER / PROFILE LOADING
============================================================ */

async function fetchMembersWithProfiles() {

  if (!org) {
    return [];
  }


  const {
    data: memberRows,
    error
  } =
    await sb
      .from(
        'organization_members'
      )
      .select(
        'org_id,user_id,role,status,joined_at'
      )
      .eq(
        'org_id',
        org.id
      );


  if (error) {

    console.error(
      'Member loading error:',
      error
    );

    return [];
  }


  const rows =
    memberRows || [];


  const userIds =
    rows.map(
      member =>
        member.user_id
    );


  if (!userIds.length) {
    return rows;
  }


  const {
    data: profileRows,
    error: profileError
  } =
    await sb
      .from('profiles')
      .select(
        'id,display_name,xp,shift_active,last_seen'
      )
      .in(
        'id',
        userIds
      );


  if (profileError) {

    console.error(
      'Profile loading error:',
      profileError
    );
  }


  const profileMap =
    new Map(
      (
        profileRows || []
      ).map(
        p => [
          p.id,
          p
        ]
      )
    );


  return rows.map(
    member => ({
      ...member,

      profiles:
        profileMap.get(
          member.user_id
        ) || null
    })
  );
}


/* ============================================================
   LOAD WORKSPACE
============================================================ */

async function loadWorkspaceData() {

  if (!org) return;


  setSync(
    '☁️ Syncing…'
  );


  const oid =
    org.id;


  const [
    memberRows,
    truckResult,
    loadResult,
    issueResult,
    taskResult,
    caseResult,
    learningResult,
    activityResult,
    documentResult,
    profileResult
  ] =
    await Promise.all([

      fetchMembersWithProfiles(),

      sb
        .from('trucks')
        .select('*')
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from('loads')
        .select(
          '*,trucks(truck_no)'
        )
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from('issues')
        .select(
          '*,trucks(truck_no)'
        )
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from('tasks')
        .select('*')
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from('cases')
        .select('*')
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from(
          'learning_notes'
        )
        .select('*')
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from(
          'activity_logs'
        )
        .select('*')
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        )
        .limit(100),

      sb
        .from(
          'load_documents'
        )
        .select('*')
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from('profiles')
        .select('*')
        .eq(
          'id',
          user.id
        )
        .maybeSingle()

    ]);


  [
    truckResult,
    loadResult,
    issueResult,
    taskResult,
    caseResult,
    learningResult,
    activityResult,
    documentResult,
    profileResult
  ].forEach(
    result => {

      if (
        result?.error
      ) {

        console.error(
          result.error
        );
      }
    }
  );


  members =
    memberRows ||
    [];

  trucks =
    truckResult.data ||
    [];

  loads =
    loadResult.data ||
    [];

  issues =
    issueResult.data ||
    [];

  tasks =
    taskResult.data ||
    [];

  cases =
    caseResult.data ||
    [];

  learning =
    learningResult.data ||
    [];

  activity =
    activityResult.data ||
    [];

  loadDocuments =
    documentResult.data ||
    [];

  profile =
    profileResult.data ||
    profile;


  populateSelects();

  renderAll();

  setSync(
    '☁️ Synced'
  );
}


/* ============================================================
   TEAM HELPERS
============================================================ */

function memberName(uid) {

  if (!uid) {
    return 'Unassigned';
  }


  const member =
    members.find(
      m =>
        m.user_id === uid
    );


  return (
    member?.profiles
      ?.display_name ||
    'Member'
  );
}


function activeMembers() {

  return members.filter(
    m =>
      m.status ===
      'active'
  );
}


function populateSelects() {

  const opts =
    '<option value="">Unassigned</option>' +

    activeMembers()
      .map(
        m => `
          <option value="${m.user_id}">
            ${esc(
              m.profiles?.display_name ||
              'Member'
            )}
            — ${esc(m.role)}
          </option>
        `
      )
      .join('');


  [
    'truckAssigned',
    'loadAssigned',
    'issueAssigned'
  ].forEach(
    id => {

      const el = $(id);

      if (el) {
        el.innerHTML =
          opts;
      }
    }
  );


  $('loadTruck')
    .innerHTML =
      '<option value="">Choose truck</option>' +

      trucks
        .map(
          t => `
            <option value="${t.id}">
              ${esc(
                t.truck_no
              )}
              —
              ${esc(
                t.driver_name
              )}
            </option>
          `
        )
        .join('');


  $('issueTruck')
    .innerHTML =
      '<option value="">None</option>' +

      trucks
        .map(
          t => `
            <option value="${t.id}">
              ${esc(
                t.truck_no
              )}
            </option>
          `
        )
        .join('');
}


/* ============================================================
   ACTIVITY / XP
============================================================ */

async function logAction(
  action,
  type,
  id,
  details
) {

  if (
    !sb ||
    !org ||
    !user
  ) {
    return;
  }


  const {
    error
  } =
    await sb
      .from(
        'activity_logs'
      )
      .insert({

        org_id:
          org.id,

        user_id:
          user.id,

        action,

        entity_type:
          type,

        entity_id:
          id
            ? String(id)
            : null,

        details
      });


  if (error) {

    console.error(
      'Activity log error:',
      error
    );
  }
}


async function gainXP(n) {

  if (!profile) {
    return;
  }


  profile.xp =
    Number(
      profile.xp || 0
    ) + n;


  const now =
    new Date()
      .toISOString();


  const {
    error
  } =
    await sb
      .from('profiles')
      .update({

        xp:
          profile.xp,

        last_seen:
          now

      })
      .eq(
        'id',
        user.id
      );


  if (error) {

    console.error(
      'XP update error:',
      error
    );
  }


  profile.last_seen =
    now;
}


/* ============================================================
   LIVE STATUS
============================================================ */

function stopLiveTimers() {

  if (heartbeatTimer) {

    clearInterval(
      heartbeatTimer
    );

    heartbeatTimer =
      null;
  }


  if (adminRefreshTimer) {

    clearInterval(
      adminRefreshTimer
    );

    adminRefreshTimer =
      null;
  }
}


function startHeartbeat() {

  if (!user || !sb) {
    return;
  }


  if (heartbeatTimer) {

    clearInterval(
      heartbeatTimer
    );
  }


  const beat =
    async () => {

      if (
        !user ||
        !sb
      ) {
        return;
      }


      const now =
        new Date()
          .toISOString();


      const {
        error
      } =
        await sb
          .from('profiles')
          .update({
            last_seen:
              now
          })
          .eq(
            'id',
            user.id
          );


      if (error) {

        console.error(
          'Heartbeat error:',
          error
        );

        return;
      }


      if (profile) {

        profile.last_seen =
          now;
      }


      const me =
        members.find(
          m =>
            m.user_id ===
            user.id
        );


      if (me?.profiles) {

        me.profiles.last_seen =
          now;
      }
    };


  beat();


  heartbeatTimer =
    setInterval(
      beat,
      HEARTBEAT_MS
    );
}


function startAdminAutoRefresh() {

  if (
    adminRefreshTimer
  ) {

    clearInterval(
      adminRefreshTimer
    );
  }


  if (
    myMembership?.role !==
      'admin'
  ) {

    return;
  }


  adminRefreshTimer =
    setInterval(
      async () => {

        if (
          currentPanel ===
          'admin'
        ) {

          await refreshAdminLive();
        }

      },
      ADMIN_REFRESH_MS
    );
}


function isOnline(member) {

  const lastSeen =
    member?.profiles
      ?.last_seen;


  if (!lastSeen) {
    return false;
  }


  const difference =
    Date.now() -
    new Date(
      lastSeen
    ).getTime();


  return (
    difference <=
    ONLINE_WINDOW_MS
  );
}


function relativeTime(timestamp) {

  if (!timestamp) {
    return 'Never';
  }


  const seconds =
    Math.max(
      0,
      Math.floor(
        (
          Date.now() -
          new Date(
            timestamp
          ).getTime()
        ) / 1000
      )
    );


  if (seconds < 60) {
    return `${seconds}s ago`;
  }


  const minutes =
    Math.floor(
      seconds / 60
    );


  if (minutes < 60) {
    return `${minutes}m ago`;
  }


  const hours =
    Math.floor(
      minutes / 60
    );


  if (hours < 24) {
    return `${hours}h ago`;
  }


  const days =
    Math.floor(
      hours / 24
    );


  return `${days}d ago`;
}


/* ============================================================
   ADMIN LIVE REFRESH
============================================================ */

async function refreshAdminLive() {

  if (
    !org ||
    myMembership?.role !==
      'admin'
  ) {

    return;
  }


  setSync(
    '📡 Updating team…'
  );


  const oid =
    org.id;


  const [
    memberRows,
    loadResult,
    issueResult,
    taskResult,
    activityResult
  ] =
    await Promise.all([

      fetchMembersWithProfiles(),

      sb
        .from('loads')
        .select(
          '*,trucks(truck_no)'
        )
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from('issues')
        .select(
          '*,trucks(truck_no)'
        )
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from('tasks')
        .select('*')
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        ),

      sb
        .from(
          'activity_logs'
        )
        .select('*')
        .eq(
          'org_id',
          oid
        )
        .order(
          'created_at',
          {
            ascending:
              false
          }
        )
        .limit(50)

    ]);


  if (
    loadResult.error
  ) {
    console.error(
      loadResult.error
    );
  }


  if (
    issueResult.error
  ) {
    console.error(
      issueResult.error
    );
  }


  if (
    taskResult.error
  ) {
    console.error(
      taskResult.error
    );
  }


  if (
    activityResult.error
  ) {
    console.error(
      activityResult.error
    );
  }


  members =
    memberRows ||
    members;


  loads =
    loadResult.data ||
    loads;


  issues =
    issueResult.data ||
    issues;


  tasks =
    taskResult.data ||
    tasks;


  activity =
    activityResult.data ||
    activity;


  renderTeam();
  renderAdmin();
  renderActivity();


  setSync(
    '🟢 Live · ' +
    new Date()
      .toLocaleTimeString(
        [],
        {
          hour:
            '2-digit',

          minute:
            '2-digit',

          second:
            '2-digit'
        }
      )
  );
}


/* ============================================================
   SHIFT
============================================================ */

$('shiftBtn')
  .addEventListener(
    'click',
    async () => {

      profile.shift_active =
        !profile.shift_active;


      const now =
        new Date()
          .toISOString();


      const {
        error
      } =
        await sb
          .from('profiles')
          .update({

            shift_active:
              profile.shift_active,

            last_seen:
              now

          })
          .eq(
            'id',
            user.id
          );


      if (error) {

        toast(
          '❌ ' +
          error.message
        );

        return;
      }


      profile.last_seen =
        now;


      const me =
        members.find(
          m =>
            m.user_id ===
            user.id
        );


      if (me?.profiles) {

        me.profiles.shift_active =
          profile.shift_active;

        me.profiles.last_seen =
          now;
      }


      await logAction(

        profile.shift_active
          ? 'Started shift'
          : 'Ended shift',

        'profile',

        user.id,

        null
      );


      renderShift();
      renderDashboard();
      renderTeam();
      renderAdmin();


      toast(

        profile.shift_active
          ? '🟢 Shift started'
          : '🔴 Shift ended'
      );
    }
  );


function renderShift() {

  $('shiftBtn')
    .textContent =
      profile?.shift_active
        ? '🔴 End Shift'
        : '🟢 Start Shift';
}


/* ============================================================
   TRUCK FORM
============================================================ */

$('truckForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      const payload = {

        org_id:
          org.id,

        truck_no:
          $('truckNo')
            .value.trim(),

        driver_name:
          $('truckDriver')
            .value.trim(),

        equipment:
          $('truckEquipment')
            .value,

        driver_type:
          $('driverType')
            .value,

        current_location:
          $('truckLocation')
            .value.trim(),

        status:
          $('truckStatus')
            .value,

        assigned_to:
          $('truckAssigned')
            .value ||
          null,

        daily_target:
          Number(
            $('truckTarget')
              .value ||
            0
          ),

        created_by:
          user.id
      };


      const {
        data,
        error
      } =
        await sb
          .from('trucks')
          .insert(
            payload
          )
          .select()
          .single();


      if (error) {

        toast(
          '❌ ' +
          error.message
        );

        return;
      }


      await gainXP(5);


      await logAction(
        'Added truck',
        'truck',
        data.id,
        payload.truck_no
      );


      e.target.reset();


      $('truckFormCard')
        .classList.add(
          'hidden'
        );


      await loadWorkspaceData();


      toast(
        '🚚 Truck added'
      );
    }
  );
/* ============================================================
   LOAD FORM
============================================================ */

$('loadForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      /*
       * Optional document selected while
       * the dispatcher is booking the load.
       *
       * These fields will be added to index.html:
       *
       * loadDocumentType
       * loadDocumentFile
       */

      const firstDocumentFile =
        $('loadDocumentFile')
          ?.files?.[0] ||
        null;


      const firstDocumentType =
        $('loadDocumentType')
          ?.value ||
        'RC';


      const payload = {

        org_id:
          org.id,

        truck_id:
          $('loadTruck')
            .value ||
          null,

        broker:
          $('loadBroker')
            .value.trim(),

        rate:
          Number(
            $('loadRate')
              .value ||
            0
          ),

        source:
          $('loadSource')
            .value,

        origin:
          $('loadOrigin')
            .value.trim(),

        destination:
          $('loadDestination')
            .value.trim(),

        loaded_miles:
          Number(
            $('loadMiles')
              .value ||
            0
          ),

        deadhead_miles:
          Number(
            $('loadDeadhead')
              .value ||
            0
          ),

        pickup_at:
          $('pickupAt')
            .value
            ? new Date(
                $('pickupAt')
                  .value
              ).toISOString()
            : null,

        delivery_at:
          $('deliveryAt')
            .value
            ? new Date(
                $('deliveryAt')
                  .value
              ).toISOString()
            : null,

        reference_no:
          $('loadRef')
            .value.trim(),

        assigned_to:
          $('loadAssigned')
            .value ||
          user.id,

        status:
          $('loadStatus')
            .value,

        notes:
          $('loadNotes')
            .value.trim(),

        created_by:
          user.id
      };


      const {
        data,
        error
      } =
        await sb
          .from('loads')
          .insert(
            payload
          )
          .select()
          .single();


      if (error) {

        toast(
          '❌ ' +
          error.message
        );

        return;
      }


      await gainXP(10);


      await logAction(
        'Booked load',
        'load',
        data.id,
        `${payload.origin} → ${payload.destination} · ${money(payload.rate)}`
      );


      /*
       * Upload first RC/BOL/POD etc.
       * if the dispatcher selected a file.
       */

      if (
        firstDocumentFile
      ) {

        await uploadLoadDocument(
          data.id,
          firstDocumentFile,
          firstDocumentType
        );
      }


      e.target.reset();


      $('loadFormCard')
        .classList.add(
          'hidden'
        );


      await loadWorkspaceData();


      toast(
        '📦 Load saved'
      );
    }
  );


/* ============================================================
   ISSUE FORM
============================================================ */

$('issueForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      const payload = {

        org_id:
          org.id,

        title:
          $('issueTitle')
            .value.trim(),

        issue_type:
          $('issueType')
            .value,

        priority:
          $('issuePriority')
            .value,

        details:
          $('issueDetails')
            .value.trim(),

        next_action:
          $('issueNext')
            .value.trim(),

        truck_id:
          $('issueTruck')
            .value ||
          null,

        assigned_to:
          $('issueAssigned')
            .value ||
          user.id,

        created_by:
          user.id
      };


      const {
        data,
        error
      } =
        await sb
          .from('issues')
          .insert(
            payload
          )
          .select()
          .single();


      if (error) {

        toast(
          '❌ ' +
          error.message
        );

        return;
      }


      await logAction(
        'Opened issue',
        'issue',
        data.id,
        payload.title
      );


      e.target.reset();


      $('issueFormCard')
        .classList.add(
          'hidden'
        );


      await loadWorkspaceData();


      toast(
        '🚨 Issue opened'
      );
    }
  );


/* ============================================================
   TASKS
============================================================ */

async function addTask(
  title,
  category =
    'Dispatch',
  priority =
    'Medium',
  due = null,
  notes = ''
) {

  const {
    data,
    error
  } =
    await sb
      .from('tasks')
      .insert({

        org_id:
          org.id,

        user_id:
          user.id,

        title,

        category,

        priority,

        due_date:
          due || null,

        notes

      })
      .select()
      .single();


  if (error) {

    toast(
      '❌ ' +
      error.message
    );

    return;
  }


  await logAction(
    'Added task',
    'task',
    data.id,
    title
  );


  await loadWorkspaceData();
}


$('quickTaskForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      const value =
        $('quickTask')
          .value.trim();


      if (!value) {
        return;
      }


      await addTask(
        value
      );


      $('quickTask').value =
        '';
    }
  );


$('taskForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      await addTask(

        $('taskTitle')
          .value.trim(),

        $('taskCategory')
          .value,

        $('taskPriority')
          .value,

        $('taskDue')
          .value,

        $('taskNotes')
          .value.trim()
      );


      e.target.reset();


      $('taskFormCard')
        .classList.add(
          'hidden'
        );
    }
  );


/* ============================================================
   CASES
============================================================ */

$('caseForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      const payload = {

        org_id:
          org.id,

        user_id:
          user.id,

        problem:
          $('caseProblem')
            .value.trim(),

        category:
          $('caseCategory')
            .value.trim(),

        solution:
          $('caseSolution')
            .value.trim(),

        lesson:
          $('caseLesson')
            .value.trim(),

        tags:
          $('caseTags')
            .value.trim(),

        visibility:
          $('caseVisibility')
            .value
      };


      const {
        data,
        error
      } =
        await sb
          .from('cases')
          .insert(
            payload
          )
          .select()
          .single();


      if (error) {

        toast(
          '❌ ' +
          error.message
        );

        return;
      }


      await gainXP(20);


      await logAction(
        'Saved case',
        'case',
        data.id,
        payload.problem
      );


      e.target.reset();


      $('caseFormCard')
        .classList.add(
          'hidden'
        );


      await loadWorkspaceData();


      toast(
        '🧠 Case saved'
      );
    }
  );


$('caseSearch')
  .addEventListener(
    'input',
    renderCases
  );


$('caseScope')
  .addEventListener(
    'change',
    renderCases
  );


/* ============================================================
   LEARNING
============================================================ */

$('learningForm')
  .addEventListener(
    'submit',
    async e => {

      e.preventDefault();


      const payload = {

        org_id:
          org.id,

        user_id:
          user.id,

        topic:
          $('learnTopic')
            .value.trim(),

        source:
          $('learnSource')
            .value.trim(),

        note:
          $('learnNote')
            .value.trim(),

        question:
          $('learnQuestion')
            .value.trim()
      };


      const {
        data,
        error
      } =
        await sb
          .from(
            'learning_notes'
          )
          .insert(
            payload
          )
          .select()
          .single();


      if (error) {

        toast(
          '❌ ' +
          error.message
        );

        return;
      }


      await gainXP(15);


      await logAction(
        'Saved learning note',
        'learning',
        data.id,
        payload.topic
      );


      e.target.reset();


      $('learningFormCard')
        .classList.add(
          'hidden'
        );


      await loadWorkspaceData();


      toast(
        '🎓 Learning saved'
      );
    }
  );


/* ============================================================
   RENDER ALL
============================================================ */

function renderAll() {

  renderDashboard();
  renderFleet();
  renderLoads();
  renderIssues();
  renderTasks();
  renderCases();
  renderLearning();
  renderTeam();
  renderActivity();
  renderAdmin();
  renderShift();
}


/* ============================================================
   DASHBOARD
============================================================ */

function renderDashboard() {

  if (
    !profile ||
    !user
  ) {
    return;
  }


  const activeLoads =
    loads.filter(
      l =>
        ![
          'Delivered',
          'Cancelled'
        ].includes(
          l.status
        )
    );


  const gross =
    loads.reduce(
      (
        sum,
        l
      ) =>
        sum +
        Number(
          l.rate || 0
        ),
      0
    );


  const miles =
    loads.reduce(
      (
        sum,
        l
      ) =>
        sum +
        Number(
          l.loaded_miles ||
          0
        ),
      0
    );


  const openIssues =
    issues.filter(
      i =>
        !i.solved
    );


  const mine =
    tasks.filter(
      t =>
        t.user_id ===
        user.id
    );


  const assignedTrucks =
    trucks.filter(
      t =>
        t.assigned_to ===
        user.id
    );


  $('welcomeTitle')
    .textContent =
      `${
        profile.shift_active
          ? 'Shift is live'
          : 'Ready to dispatch'
      }, ${
        profile.display_name
      }?`;


  $('xpValue')
    .textContent =
      profile.xp ||
      0;


  const xp =
    Number(
      profile.xp ||
      0
    );


  $('levelText')
    .textContent =
      xp >= 1000
        ? 'Operations Commander'
        : xp >= 500
        ? 'Fleet Controller'
        : xp >= 250
        ? 'Senior Dispatcher'
        : xp >= 100
        ? 'Dispatcher Specialist'
        : 'Rookie Dispatcher';


  $('statTrucks')
    .textContent =
      trucks.length;


  $('statAssigned')
    .textContent =
      `${assignedTrucks.length} assigned to you`;


  $('statLoads')
    .textContent =
      activeLoads.length;


  $('statLoadGross')
    .textContent =
      `${money(
        activeLoads.reduce(
          (
            sum,
            l
          ) =>
            sum +
            Number(
              l.rate || 0
            ),
          0
        )
      )} active gross`;


  $('statGross')
    .textContent =
      money(
        gross
      );


  $('statRpm')
    .textContent =
      `${
        miles
          ? '$' +
            (
              gross /
              miles
            ).toFixed(2)
          : '$0.00'
      } avg RPM`;


  $('statIssues')
    .textContent =
      openIssues.length;


  $('statCritical')
    .textContent =
      `${
        openIssues.filter(
          i =>
            i.priority ===
            'Critical'
        ).length
      } critical`;


  $('taskDone')
    .textContent =
      mine.filter(
        t =>
          t.done
      ).length;


  $('taskTotal')
    .textContent =
      mine.length;


  $('dashboardTasks')
    .innerHTML =
      mine
        .slice(
          0,
          6
        )
        .map(
          t =>
            taskHtml(
              t,
              true
            )
        )
        .join('') ||

      '<div class="item meta">No tasks yet.</div>';


  bindTaskButtons(
    $('dashboardTasks')
  );


  const available =
    trucks.filter(
      t =>
        t.status ===
        'Available'
    ).length;


  const critical =
    openIssues.filter(
      i =>
        i.priority ===
        'Critical'
    ).length;


  const overdue =
    mine.filter(
      t =>
        !t.done &&
        t.due_date &&
        t.due_date <
          new Date()
            .toISOString()
            .slice(
              0,
              10
            )
    ).length;


  $('attentionRadar')
    .innerHTML = [

      [
        '🚚 Available Trucks',
        available,
        'Need freight'
      ],

      [
        '🔴 Critical Issues',
        critical,
        'Handle first'
      ],

      [
        '⏰ Overdue Tasks',
        overdue,
        'Personal follow-up'
      ],

      [
        '🧠 Knowledge',
        cases.length +
        learning.length,
        'Cases + learning'
      ]

    ]
      .map(
        x => `
          <div class="radar">

            <span class="muted">
              ${x[0]}
            </span>

            <strong>
              ${x[1]}
            </strong>

            <small class="muted">
              ${x[2]}
            </small>

          </div>
        `
      )
      .join('');


  $('dashboardLoads')
    .innerHTML =
      loadTable(
        activeLoads.slice(
          0,
          8
        ),
        false
      );
}


/* ============================================================
   STATUS BADGE
============================================================ */

function statusBadge(s) {

  const cls =
    [
      'Available',
      'Delivered',
      'Covered',
      'Resolved'
    ].includes(s)
      ? 'good'
      : [
          'Breakdown',
          'Cancelled',
          'Critical'
        ].includes(s)
      ? 'danger'
      : 'warn';


  return `
    <span class="badge ${cls}">
      ${esc(s)}
    </span>
  `;
}


/* ============================================================
   FLEET
============================================================ */

function renderFleet() {

  $('fleetGrid')
    .innerHTML =
      trucks
        .map(
          t => `
            <article class="card truck-card">

              <div class="top">

                <div>

                  <p class="eyebrow">
                    TRUCK ${esc(
                      t.truck_no
                    )}
                  </p>

                  <h3>
                    ${esc(
                      t.driver_name
                    )}
                  </h3>

                  <div class="meta">
                    ${esc(
                      t.equipment
                    )}
                    ·
                    ${esc(
                      t.driver_type
                    )}
                  </div>

                </div>

                ${statusBadge(
                  t.status
                )}

              </div>


              <div class="metric-row">

                <div class="metric">

                  <small>
                    📍 Location
                  </small>

                  <strong>
                    ${esc(
                      t.current_location ||
                      'Not set'
                    )}
                  </strong>

                </div>


                <div class="metric">

                  <small>
                    👤 Dispatcher
                  </small>

                  <strong>
                    ${esc(
                      memberName(
                        t.assigned_to
                      )
                    )}
                  </strong>

                </div>


                <div class="metric">

                  <small>
                    🎯 Daily target
                  </small>

                  <strong>
                    ${money(
                      t.daily_target
                    )}
                  </strong>

                </div>


                <div class="metric">

                  <small>
                    Updated
                  </small>

                  <strong>
                    ${
                      fmt(
                        t.updated_at
                      ).split(',')[0]
                    }
                  </strong>

                </div>

              </div>

            </article>
          `
        )
        .join('') ||

      '<div class="card muted">No trucks yet.</div>';
}


/* ============================================================
   LOAD DOCUMENT SYSTEM
============================================================ */

function loadDocs(loadId) {

  return loadDocuments.filter(
    doc =>
      String(
        doc.load_id
      ) ===
      String(
        loadId
      )
  );
}


function hasLoadDoc(
  loadId,
  type
) {

  return loadDocs(
    loadId
  ).some(
    doc =>
      doc.document_type ===
      type
  );
}


function documentIcon(type) {

  if (
    type === 'RC'
  ) return '📄';

  if (
    type === 'BOL'
  ) return '📋';

  if (
    type === 'POD'
  ) return '✅';

  if (
    type === 'Lumper'
  ) return '💵';

  return '📎';
}


function safeFileName(name) {

  return String(
    name ||
    'document'
  ).replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );
}


async function uploadLoadDocument(
  loadId,
  file,
  type
) {

  if (!file) {
    return false;
  }


  if (
    ![
      'admin',
      'dispatcher'
    ].includes(
      myMembership?.role
    )
  ) {

    toast(
      '❌ You cannot upload load documents'
    );

    return false;
  }


  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ];


  if (
    file.type &&
    !allowedTypes.includes(
      file.type
    )
  ) {

    toast(
      '❌ Use PDF, JPG, PNG or WEBP files'
    );

    return false;
  }


  const maxFileSize =
    20 *
    1024 *
    1024;


  if (
    file.size >
    maxFileSize
  ) {

    toast(
      '❌ Maximum document size is 20 MB'
    );

    return false;
  }


  const unique =
    window.crypto
      ?.randomUUID
      ? window.crypto
          .randomUUID()
      : `${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;


  const storagePath =
    `${org.id}/${loadId}/${unique}-${safeFileName(
      file.name
    )}`;


  setSync(
    `📎 Uploading ${type}…`
  );


  const {
    error:
      uploadError
  } =
    await sb.storage
      .from(
        'load-documents'
      )
      .upload(
        storagePath,
        file,
        {
          cacheControl:
            '3600',

          upsert:
            false
        }
      );


  if (
    uploadError
  ) {

    console.error(
      'Document upload error:',
      uploadError
    );


    setSync(
      '☁️ Synced'
    );


    toast(
      '❌ Upload failed: ' +
      uploadError.message
    );

    return false;
  }


  const {
    data:
      documentRow,

    error:
      dbError
  } =
    await sb
      .from(
        'load_documents'
      )
      .insert({

        org_id:
          org.id,

        load_id:
          loadId,

        uploaded_by:
          user.id,

        document_type:
          type,

        file_name:
          file.name,

        storage_path:
          storagePath

      })
      .select()
      .single();


  if (
    dbError
  ) {

    console.error(
      'Document database error:',
      dbError
    );


    await sb.storage
      .from(
        'load-documents'
      )
      .remove([
        storagePath
      ]);


    setSync(
      '☁️ Synced'
    );


    toast(
      '❌ Document could not be saved: ' +
      dbError.message
    );

    return false;
  }


  if (
    documentRow
  ) {

    loadDocuments.unshift(
      documentRow
    );
  }


  await logAction(
    `Uploaded ${type}`,
    'load',
    loadId,
    file.name
  );


  setSync(
    '☁️ Synced'
  );


  toast(
    `✅ ${type} uploaded`
  );


  return true;
}


async function openLoadDocument(
  documentId
) {

  const doc =
    loadDocuments.find(
      d =>
        String(
          d.id
        ) ===
        String(
          documentId
        )
    );


  if (!doc) {
    return;
  }


  const {
    data,
    error
  } =
    await sb.storage
      .from(
        'load-documents'
      )
      .createSignedUrl(
        doc.storage_path,
        300
      );


  if (
    error
  ) {

    toast(
      '❌ Cannot open document: ' +
      error.message
    );

    return;
  }


  if (
    !data?.signedUrl
  ) {

    toast(
      '❌ Document link could not be created'
    );

    return;
  }


  window.open(
    data.signedUrl,
    '_blank',
    'noopener,noreferrer'
  );
}


async function deleteLoadDocument(
  documentId
) {

  if (
    ![
      'admin',
      'dispatcher'
    ].includes(
      myMembership?.role
    )
  ) {
    return;
  }


  const doc =
    loadDocuments.find(
      d =>
        String(
          d.id
        ) ===
        String(
          documentId
        )
    );


  if (!doc) {
    return;
  }


  const confirmed =
    window.confirm(
      `Delete ${doc.document_type} — ${doc.file_name}?`
    );


  if (
    !confirmed
  ) {
    return;
  }


  const {
    error:
      storageError
  } =
    await sb.storage
      .from(
        'load-documents'
      )
      .remove([
        doc.storage_path
      ]);


  if (
    storageError
  ) {

    toast(
      '❌ Could not delete file: ' +
      storageError.message
    );

    return;
  }


  const {
    error
  } =
    await sb
      .from(
        'load_documents'
      )
      .delete()
      .eq(
        'id',
        doc.id
      );


  if (
    error
  ) {

    toast(
      '❌ ' +
      error.message
    );

    return;
  }


  loadDocuments =
    loadDocuments.filter(
      d =>
        String(
          d.id
        ) !==
        String(
          doc.id
        )
    );


  await logAction(
    `Deleted ${doc.document_type}`,
    'load',
    doc.load_id,
    doc.file_name
  );


  renderLoads();
  renderDashboard();


  toast(
    '🗑️ Document deleted'
  );
}


function documentPanel(
  load
) {

  const docs =
    loadDocs(
      load.id
    );


  const hasRC =
    hasLoadDoc(
      load.id,
      'RC'
    );


  const hasBOL =
    hasLoadDoc(
      load.id,
      'BOL'
    );


  const hasPOD =
    hasLoadDoc(
      load.id,
      'POD'
    );


  const podWarning =
    load.status ===
      'Delivered' &&
    !hasPOD;


  return `
    <div
      class="load-documents"
      style="
        padding:12px;
        border-radius:12px;
        border:1px solid rgba(148,163,184,.18);
      "
    >

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
        "
      >

        <strong>
          📁 Load Documents
        </strong>


        <div class="meta">

          RC
          ${
            hasRC
              ? '✅'
              : '❌'
          }

          · BOL
          ${
            hasBOL
              ? '✅'
              : '❌'
          }

          · POD
          ${
            hasPOD
              ? '✅'
              : '❌'
          }

        </div>

      </div>


      ${
        podWarning
          ? `
            <div
              class="notice"
              style="
                margin-top:10px
              "
            >

              🚨
              <b>
                POD MISSING:
              </b>

              This load is marked
              Delivered.

            </div>
          `
          : ''
      }


      <div
        style="
          display:flex;
          flex-wrap:wrap;
          gap:8px;
          margin-top:10px;
        "
      >

        ${
          docs.length
            ? docs
                .map(
                  doc => `
                    <div
                      class="pill"
                      style="
                        display:flex;
                        align-items:center;
                        gap:6px;
                      "
                    >

                      <button
                        class="link-btn open-load-doc"
                        data-doc="${doc.id}"
                        type="button"
                      >

                        ${documentIcon(
                          doc.document_type
                        )}

                        ${esc(
                          doc.document_type
                        )}

                        —

                        ${esc(
                          doc.file_name
                        )}

                      </button>


                      ${
                        [
                          'admin',
                          'dispatcher'
                        ].includes(
                          myMembership?.role
                        )
                          ? `
                            <button
                              class="link-btn delete-load-doc"
                              data-doc="${doc.id}"
                              type="button"
                              title="Delete document"
                            >
                              ✕
                            </button>
                          `
                          : ''
                      }

                    </div>
                  `
                )
                .join('')
            : `
              <span class="muted">
                No documents uploaded yet.
              </span>
            `
        }

      </div>


      ${
        [
          'admin',
          'dispatcher'
        ].includes(
          myMembership?.role
        )
          ? `
            <div
              style="
                display:grid;
                grid-template-columns:
                  minmax(120px,160px)
                  minmax(220px,1fr)
                  auto;
                gap:8px;
                margin-top:12px;
                align-items:end;
              "
            >

              <label>

                Document type

                <select
                  class="extra-doc-type"
                  data-load="${load.id}"
                >

                  <option value="RC">
                    📄 RC
                  </option>

                  <option value="BOL">
                    📋 BOL
                  </option>

                  <option value="POD">
                    ✅ POD
                  </option>

                  <option value="Lumper">
                    💵 Lumper
                  </option>

                  <option value="Other">
                    📎 Other
                  </option>

                </select>

              </label>


              <label>

                File

                <input
                  class="extra-doc-file"
                  data-load="${load.id}"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                >

              </label>


              <button
                class="btn ghost extra-doc-upload"
                data-load="${load.id}"
                type="button"
              >
                ⬆ Upload
              </button>

            </div>
          `
          : ''
      }

    </div>
  `;
}


function bindLoadDocumentButtons() {

  document
    .querySelectorAll(
      '.open-load-doc'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            openLoadDocument(
              button.dataset.doc
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      '.delete-load-doc'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            deleteLoadDocument(
              button.dataset.doc
            );
          }
        );
      }
    );


  document
    .querySelectorAll(
      '.extra-doc-upload'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          async () => {

            const loadId =
              button.dataset.load;


            const typeSelect =
              document.querySelector(
                `.extra-doc-type[data-load="${loadId}"]`
              );


            const fileInput =
              document.querySelector(
                `.extra-doc-file[data-load="${loadId}"]`
              );


            const file =
              fileInput
                ?.files?.[0];


            if (
              !file
            ) {

              toast(
                '⚠️ Choose a document first'
              );

              return;
            }


            const previousText =
              button.textContent;


            button.disabled =
              true;


            button.textContent =
              '⏳ Uploading…';


            const ok =
              await uploadLoadDocument(
                loadId,
                file,
                typeSelect
                  ?.value ||
                'Other'
              );


            button.disabled =
              false;


            button.textContent =
              previousText;


            if (
              ok &&
              fileInput
            ) {

              fileInput.value =
                '';

              renderLoads();
            }
          }
        );
      }
    );
}
/* ============================================================
   LOADS
============================================================ */

function rpm(l) {

  return Number(
    l.loaded_miles
  ) > 0
    ? (
        Number(
          l.rate
        ) /
        Number(
          l.loaded_miles
        )
      ).toFixed(2)
    : '0.00';
}


function allIn(l) {

  const miles =
    Number(
      l.loaded_miles ||
      0
    ) +
    Number(
      l.deadhead_miles ||
      0
    );


  return miles > 0
    ? (
        Number(
          l.rate
        ) /
        miles
      ).toFixed(2)
    : '0.00';
}


function loadTable(
  list,
  actions = true
) {

  return `
    <table class="data-table">

      <thead>

        <tr>

          <th>
            Truck
          </th>

          <th>
            Lane
          </th>

          <th>
            Broker
          </th>

          <th>
            Rate
          </th>

          <th>
            RPM
          </th>

          <th>
            All-in
          </th>

          <th>
            Dispatcher
          </th>

          <th>
            Documents
          </th>

          <th>
            Status
          </th>


          ${
            actions
              ? `
                <th>
                  Action
                </th>
              `
              : ''
          }

        </tr>

      </thead>


      <tbody>

        ${
          list.length

            ? list
                .map(
                  l => {

                    const hasRC =
                      hasLoadDoc(
                        l.id,
                        'RC'
                      );


                    const hasBOL =
                      hasLoadDoc(
                        l.id,
                        'BOL'
                      );


                    const hasPOD =
                      hasLoadDoc(
                        l.id,
                        'POD'
                      );


                    const podMissing =
                      l.status ===
                        'Delivered' &&
                      !hasPOD;


                    return `

                      <tr>

                        <td>

                          ${esc(
                            l.trucks
                              ?.truck_no ||
                            '—'
                          )}

                        </td>


                        <td>

                          <b>
                            ${esc(
                              l.origin
                            )}
                          </b>

                          <br>

                          <span class="meta">
                            →
                            ${esc(
                              l.destination
                            )}
                          </span>


                          ${
                            podMissing
                              ? `
                                <div
                                  class="meta"
                                  style="
                                    color:var(--danger);
                                    margin-top:5px;
                                    font-weight:700;
                                  "
                                >
                                  🚨 POD MISSING
                                </div>
                              `
                              : ''
                          }

                        </td>


                        <td>

                          ${esc(
                            l.broker
                          )}

                          <br>

                          <span class="meta">
                            ${esc(
                              l.source ||
                              '—'
                            )}
                          </span>

                        </td>


                        <td>

                          ${money(
                            l.rate
                          )}

                        </td>


                        <td>

                          $${rpm(l)}

                        </td>


                        <td>

                          $${allIn(l)}

                        </td>


                        <td>

                          ${esc(
                            memberName(
                              l.assigned_to
                            )
                          )}

                        </td>


                        <td>

                          <div
                            style="
                              display:flex;
                              flex-direction:column;
                              gap:4px;
                              min-width:90px;
                            "
                          >

                            <span
                              class="meta"
                              style="
                                white-space:nowrap;
                              "
                            >
                              📄 RC
                              ${
                                hasRC
                                  ? '✅'
                                  : '❌'
                              }
                            </span>


                            <span
                              class="meta"
                              style="
                                white-space:nowrap;
                              "
                            >
                              📋 BOL
                              ${
                                hasBOL
                                  ? '✅'
                                  : '❌'
                              }
                            </span>


                            <span
                              class="meta"
                              style="
                                white-space:nowrap;
                              "
                            >
                              ✅ POD
                              ${
                                hasPOD
                                  ? '✅'
                                  : '❌'
                              }
                            </span>

                          </div>

                        </td>


                        <td>

                          ${statusBadge(
                            l.status
                          )}

                        </td>


                        ${
                          actions
                            ? `
                              <td>

                                <select
                                  class="load-status"
                                  data-id="${l.id}"
                                >

                                  <option>
                                    Booked
                                  </option>

                                  <option>
                                    At Pickup
                                  </option>

                                  <option>
                                    In Transit
                                  </option>

                                  <option>
                                    At Delivery
                                  </option>

                                  <option>
                                    Delivered
                                  </option>

                                  <option>
                                    Cancelled
                                  </option>

                                </select>

                              </td>
                            `
                            : ''
                        }

                      </tr>


                      ${
                        actions
                          ? `
                            <tr>

                              <td
                                colspan="10"
                                style="
                                  padding-top:0;
                                "
                              >

                                ${documentPanel(
                                  l
                                )}

                              </td>

                            </tr>
                          `
                          : ''
                      }

                    `;
                  }
                )
                .join('')

            : `
              <tr>

                <td
                  colspan="${
                    actions
                      ? '10'
                      : '9'
                  }"
                >

                  <div class="meta">
                    No loads recorded yet.
                  </div>

                </td>

              </tr>
            `
        }

      </tbody>

    </table>
  `;
}


function renderLoads() {

  $('loadsTable')
    .innerHTML =
      loadTable(
        loads,
        true
      );


  document
    .querySelectorAll(
      '.load-status'
    )
    .forEach(
      select => {

        const load =
          loads.find(
            x =>
              String(
                x.id
              ) ===
              String(
                select.dataset.id
              )
          );


        if (!load) {
          return;
        }


        select.value =
          load.status;


        select.disabled =
          ![
            'admin',
            'dispatcher'
          ].includes(
            myMembership.role
          );


        select
          .addEventListener(
            'change',
            async () => {

              const oldStatus =
                load.status;


              const newStatus =
                select.value;


              select.disabled =
                true;


              const {
                error
              } =
                await sb
                  .from(
                    'loads'
                  )
                  .update({

                    status:
                      newStatus,

                    updated_at:
                      new Date()
                        .toISOString()

                  })
                  .eq(
                    'id',
                    load.id
                  );


              if (error) {

                toast(
                  '❌ ' +
                  error.message
                );


                select.value =
                  oldStatus;


                select.disabled =
                  false;


                return;
              }


              load.status =
                newStatus;


              if (
                newStatus ===
                  'Delivered' &&
                oldStatus !==
                  'Delivered'
              ) {

                await gainXP(
                  20
                );
              }


              await logAction(
                'Updated load status',
                'load',
                load.id,
                `${oldStatus} → ${newStatus}`
              );


              await loadWorkspaceData();


              if (
                newStatus ===
                  'Delivered' &&
                !hasLoadDoc(
                  load.id,
                  'POD'
                )
              ) {

                toast(
                  '🚨 Load delivered — POD is still missing'
                );

              } else {

                toast(
                  `✅ Load status: ${newStatus}`
                );
              }
            }
          );
      }
    );


  /*
   * Connect Open / Delete / Upload
   * buttons after the load table
   * has been created.
   */

  bindLoadDocumentButtons();
}
/* ============================================================
   ISSUES
============================================================ */

function renderIssues() {

  $('issuesList')
    .innerHTML =
      issues
        .map(
          i => `
            <article
              class="item issue-card ${esc(
                String(
                  i.priority ||
                  ''
                ).toLowerCase()
              )}"
            >

              <div class="item-row">

                <div>

                  <h3 style="margin:0">

                    ${
                      i.solved
                        ? '✅'
                        : '🚨'
                    }

                    ${esc(
                      i.title
                    )}

                  </h3>


                  <div class="meta">

                    ${esc(
                      i.issue_type
                    )}

                    ·

                    ${esc(
                      i.priority
                    )}

                    · Truck

                    ${esc(
                      i.trucks
                        ?.truck_no ||
                      '—'
                    )}

                    · Assigned:

                    ${esc(
                      memberName(
                        i.assigned_to
                      )
                    )}

                  </div>

                </div>


                ${statusBadge(
                  i.solved
                    ? 'Resolved'
                    : i.priority
                )}

              </div>


              <p>
                ${esc(
                  i.details
                )}
              </p>


              ${
                i.next_action
                  ? `
                    <div class="notice">
                      <b>
                        ➡️ Next action:
                      </b>
                      ${esc(
                        i.next_action
                      )}
                    </div>
                  `
                  : ''
              }


              <div class="issue-actions">

                <button
                  class="small-btn issue-toggle"
                  data-id="${i.id}"
                >
                  ${
                    i.solved
                      ? '↩️ Reopen'
                      : '✅ Resolve'
                  }
                </button>

                <button
                  class="small-btn issue-case"
                  data-id="${i.id}"
                >
                  🧠 Save as Case
                </button>

              </div>

            </article>
          `
        )
        .join('') ||

      '<div class="card muted">No issues recorded.</div>';


  document
    .querySelectorAll(
      '.issue-toggle'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          async () => {

            const issue =
              issues.find(
                x =>
                  String(
                    x.id
                  ) ===
                  String(
                    button.dataset.id
                  )
              );


            if (!issue) {
              return;
            }


            const solved =
              !issue.solved;


            const {
              error
            } =
              await sb
                .from('issues')
                .update({

                  solved,

                  resolved_at:
                    solved
                      ? new Date()
                          .toISOString()
                      : null,

                  updated_at:
                    new Date()
                      .toISOString()

                })
                .eq(
                  'id',
                  issue.id
                );


            if (error) {

              toast(
                '❌ ' +
                error.message
              );

              return;
            }


            if (solved) {

              await gainXP(
                20
              );
            }


            await logAction(

              solved
                ? 'Resolved issue'
                : 'Reopened issue',

              'issue',

              issue.id,

              issue.title
            );


            await loadWorkspaceData();
          }
        );
      }
    );


  document
    .querySelectorAll(
      '.issue-case'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          () => {

            const issue =
              issues.find(
                x =>
                  String(
                    x.id
                  ) ===
                  String(
                    button.dataset.id
                  )
              );


            if (!issue) {
              return;
            }


            showPanel(
              'cases'
            );


            $('caseProblem')
              .value =
                issue.title;

            $('caseCategory')
              .value =
                issue.issue_type;

            $('caseSolution')
              .value =
                issue.details;

            $('caseLesson')
              .value =
                issue.next_action ||
                '';

            $('caseVisibility')
              .value =
                'company';


            $('caseFormCard')
              .classList.remove(
                'hidden'
              );
          }
        );
      }
    );
}


/* ============================================================
   TASK RENDERING
============================================================ */

function taskHtml(
  t,
  compact = false
) {

  return `
    <div class="item item-row">

      <label
        style="
          display:flex;
          grid-template-columns:auto 1fr;
          align-items:center;
          gap:10px;
          margin:0;
          flex:1
        "
      >

        <input
          class="task-check"
          data-id="${t.id}"
          type="checkbox"
          style="width:auto"
          ${t.done ? 'checked' : ''}
        >

        <span>

          <b
            ${
              t.done
                ? 'style="text-decoration:line-through;opacity:.55"'
                : ''
            }
          >
            ${esc(
              t.title
            )}
          </b>

          ${
            compact
              ? ''
              : `
                <div class="meta">

                  ${esc(
                    t.category ||
                    'Task'
                  )}

                  ·

                  ${esc(
                    t.priority ||
                    'Medium'
                  )}

                  ${
                    t.due_date
                      ? ' · Due ' +
                        esc(
                          t.due_date
                        )
                      : ''
                  }

                </div>
              `
          }

        </span>

      </label>


      ${
        compact
          ? ''
          : `
            <button
              class="small-btn task-delete"
              data-id="${t.id}"
            >
              🗑️
            </button>
          `
      }

    </div>
  `;
}


function bindTaskButtons(
  root = document
) {

  root
    .querySelectorAll(
      '.task-check'
    )
    .forEach(
      checkbox => {

        checkbox.addEventListener(
          'change',
          async () => {

            const task =
              tasks.find(
                x =>
                  String(
                    x.id
                  ) ===
                  String(
                    checkbox.dataset.id
                  )
              );


            if (!task) {
              return;
            }


            const {
              error
            } =
              await sb
                .from('tasks')
                .update({

                  done:
                    checkbox.checked,

                  updated_at:
                    new Date()
                      .toISOString()

                })
                .eq(
                  'id',
                  task.id
                );


            if (error) {

              toast(
                '❌ ' +
                error.message
              );

              checkbox.checked =
                !checkbox.checked;

              return;
            }


            if (
              checkbox.checked &&
              !task.done
            ) {

              await gainXP(
                10
              );
            }


            await logAction(

              checkbox.checked
                ? 'Completed task'
                : 'Reopened task',

              'task',

              task.id,

              task.title
            );


            await loadWorkspaceData();
          }
        );
      }
    );


  root
    .querySelectorAll(
      '.task-delete'
    )
    .forEach(
      button => {

        button.addEventListener(
          'click',
          async () => {

            const {
              error
            } =
              await sb
                .from('tasks')
                .delete()
                .eq(
                  'id',
                  button.dataset.id
                );


            if (error) {

              toast(
                '❌ ' +
                error.message
              );

              return;
            }


            await loadWorkspaceData();
          }
        );
      }
    );
}


function renderTasks() {

  const mine =
    tasks.filter(
      t =>
        t.user_id ===
        user.id
    );


  $('tasksList')
    .innerHTML =
      mine
        .map(
          t =>
            taskHtml(t)
        )
        .join('') ||

      '<div class="card muted">No personal tasks yet.</div>';


  bindTaskButtons(
    $('tasksList')
  );
}


/* ============================================================
   CASES
============================================================ */

function renderCases() {

  const query =
    (
      $('caseSearch')
        .value ||
      ''
    ).toLowerCase();


  const scope =
    $('caseScope')
      .value;


  let list =
    cases.filter(
      c =>
        scope === 'all' ||
        c.visibility ===
          scope
    );


  list =
    list.filter(
      c =>
        (
          `${c.problem} ${c.category} ${c.solution} ${c.lesson} ${c.tags}`
        )
          .toLowerCase()
          .includes(
            query
          )
    );


  $('casesList')
    .innerHTML =
      list
        .map(
          c => `
            <article
              class="item case-card ${c.visibility}"
            >

              <div class="item-row">

                <div>

                  <h3 style="margin:0">
                    🧩
                    ${esc(
                      c.problem
                    )}
                  </h3>

                  <div class="meta">

                    ${
                      c.visibility ===
                      'company'
                        ? '🏢 Company'
                        : '🔒 Personal'
                    }

                    ·

                    ${esc(
                      c.category ||
                      'General'
                    )}

                    · by

                    ${esc(
                      memberName(
                        c.user_id
                      )
                    )}

                  </div>

                </div>


                <span
                  class="badge ${
                    c.visibility ===
                    'company'
                      ? 'good'
                      : 'warn'
                  }"
                >
                  ${esc(
                    c.visibility
                  )}
                </span>

              </div>


              <p>

                <b>
                  ✅ Solution:
                </b>

                ${esc(
                  c.solution
                )}

              </p>


              <p>

                <b>
                  💡 Next time:
                </b>

                ${esc(
                  c.lesson ||
                  '—'
                )}

              </p>


              ${
                c.tags
                  ? `
                    <div class="meta">
                      🏷
                      ${esc(
                        c.tags
                      )}
                    </div>
                  `
                  : ''
              }

            </article>
          `
        )
        .join('') ||

      '<div class="card muted">No matching cases.</div>';
}


/* ============================================================
   LEARNING
============================================================ */

function renderLearning() {

  const list =
    learning.filter(
      l =>
        l.user_id ===
        user.id
    );


  $('learningList')
    .innerHTML =
      list
        .map(
          l => `
            <article class="item">

              <h3 style="margin:0">
                🎓
                ${esc(
                  l.topic
                )}
              </h3>

              <div class="meta">

                ${esc(
                  l.source ||
                  'Personal learning'
                )}

                ·

                ${fmt(
                  l.created_at
                )}

              </div>

              <p>
                📘
                ${esc(
                  l.note
                )}
              </p>

              <p>
                ${
                  l.question
                    ? '❓ ' +
                      esc(
                        l.question
                      )
                    : '✅ No open question.'
                }
              </p>

            </article>
          `
        )
        .join('') ||

      '<div class="card muted">No learning notes yet.</div>';
}


/* ============================================================
   TEAM
============================================================ */

function renderTeam() {

  $('teamList')
    .innerHTML =
      activeMembers()
        .map(
          m => {

            const online =
              isOnline(m);

            return `
              <article class="card member-card">

                <div class="top">

                  <div>

                    <p class="eyebrow">
                      ${
                        online
                          ? '🟢 ONLINE'
                          : '⚪ OFFLINE'
                      }
                    </p>

                    <h3>
                      ${esc(
                        m.profiles
                          ?.display_name ||
                        'Member'
                      )}
                    </h3>

                    <div class="meta">
                      ${roleLabel(
                        m.role
                      )}
                    </div>

                  </div>


                  <div class="avatar">

                    ${esc(
                      (
                        m.profiles
                          ?.display_name ||
                        'M'
                      )[0]
                        .toUpperCase()
                    )}

                  </div>

                </div>


                <div class="metric-row">

                  <div class="metric">

                    <small>
                      ⭐ XP
                    </small>

                    <strong>
                      ${m.profiles?.xp || 0}
                    </strong>

                  </div>


                  <div class="metric">

                    <small>
                      Shift
                    </small>

                    <strong>
                      ${
                        m.profiles
                          ?.shift_active
                          ? '🟢 Live'
                          : '⚪ Off'
                      }
                    </strong>

                  </div>


                  <div class="metric">

                    <small>
                      Last seen
                    </small>

                    <strong>
                      ${relativeTime(
                        m.profiles
                          ?.last_seen
                      )}
                    </strong>

                  </div>

                </div>


                ${
                  myMembership.role ===
                    'admin' &&
                  m.user_id !==
                    user.id
                    ? `
                      <label style="margin-top:12px">

                        Role

                        <select
                          class="role-select"
                          data-user="${m.user_id}"
                        >

                          <option value="dispatcher">
                            Dispatcher
                          </option>

                          <option value="trainer">
                            Trainer
                          </option>

                          <option value="admin">
                            Admin
                          </option>

                        </select>

                      </label>
                    `
                    : ''
                }

              </article>
            `;
          }
        )
        .join('') ||

      '<div class="card muted">No active team members.</div>';


  document
    .querySelectorAll(
      '.role-select'
    )
    .forEach(
      select => {

        const member =
          members.find(
            x =>
              x.user_id ===
              select.dataset.user
          );


        if (!member) {
          return;
        }


        select.value =
          member.role;


        select.addEventListener(
          'change',
          async () => {

            const oldRole =
              member.role;


            const {
              error
            } =
              await sb
                .from(
                  'organization_members'
                )
                .update({
                  role:
                    select.value
                })
                .eq(
                  'org_id',
                  org.id
                )
                .eq(
                  'user_id',
                  member.user_id
                );


            if (error) {

              toast(
                '❌ ' +
                error.message
              );

              select.value =
                oldRole;

              return;
            }


            await logAction(
              'Changed member role',
              'member',
              member.user_id,
              `${oldRole} → ${select.value}`
            );


            await loadWorkspaceData();


            toast(
              'Role updated'
            );
          }
        );
      }
    );
}
/* ============================================================
   ACTIVITY
============================================================ */

function renderActivity() {

  const html =
    activity
      .map(
        a => {

          const icon =
            a.entity_type ===
            'load'
              ? '📦'
              : a.entity_type ===
                'truck'
              ? '🚚'
              : a.entity_type ===
                'issue'
              ? '🚨'
              : a.entity_type ===
                'task'
              ? '🎯'
              : a.entity_type ===
                'case'
              ? '🧠'
              : a.entity_type ===
                'learning'
              ? '🎓'
              : a.entity_type ===
                'profile'
              ? '🟢'
              : '📜';


          return `
            <div class="item activity-row">

              <div class="activity-icon">
                ${icon}
              </div>

              <div>

                <b>
                  ${esc(
                    memberName(
                      a.user_id
                    )
                  )}
                  ·
                  ${esc(
                    a.action
                  )}
                </b>

                <div class="meta">
                  ${esc(
                    a.details ||
                    a.entity_type ||
                    ''
                  )}
                </div>

              </div>

              <div class="meta">
                ${fmt(
                  a.created_at
                )}
              </div>

            </div>
          `;
        }
      )
      .join('') ||

    '<div class="card muted">No activity yet.</div>';


  $('activityList')
    .innerHTML =
      html;


  if (
    $('adminActivity')
  ) {

    $('adminActivity')
      .innerHTML =
        activity
          .slice(
            0,
            15
          )
          .map(
            a => `
              <div class="item">

                <b>
                  ${esc(
                    memberName(
                      a.user_id
                    )
                  )}
                </b>

                ·

                ${esc(
                  a.action
                )}

                <div class="meta">

                  ${esc(
                    a.details ||
                    ''
                  )}

                  ·

                  ${fmt(
                    a.created_at
                  )}

                </div>

              </div>
            `
          )
          .join('') ||

        '<div class="card muted">No activity yet.</div>';
  }
}


/* ============================================================
   ADMIN
============================================================ */

function renderAdmin() {

  if (
    myMembership?.role !==
      'admin'
  ) {

    return;
  }


  const active =
    activeMembers();


  const delivered =
    loads.filter(
      l =>
        l.status ===
        'Delivered'
    ).length;


  const totalGross =
    loads.reduce(
      (
        sum,
        l
      ) =>
        sum +
        Number(
          l.rate || 0
        ),
      0
    );


  const critical =
    issues.filter(
      i =>
        !i.solved &&
        i.priority ===
        'Critical'
    ).length;


  const onlineCount =
    active.filter(
      isOnline
    ).length;


  const workingCount =
    active.filter(
      m =>
        isOnline(m) &&
        m.profiles
          ?.shift_active
    ).length;


  $('adminMembers')
    .textContent =
      active.length;


  $('adminGross')
    .textContent =
      money(
        totalGross
      );


  $('adminDelivered')
    .textContent =
      delivered;


  $('adminCritical')
    .textContent =
      critical;


  if (
    $('adminOnline')
  ) {

    $('adminOnline')
      .textContent =
        onlineCount;
  }


  if (
    $('adminWorking')
  ) {

    $('adminWorking')
      .textContent =
        workingCount;
  }


  const liveCards =
    active
      .map(
        m => {

          const uid =
            m.user_id;


          const online =
            isOnline(m);


          const booked =
            loads.filter(
              l =>
                l.created_by ===
                uid
            );


          const assigned =
            loads.filter(
              l =>
                l.assigned_to ===
                uid
            );


          const memberTasks =
            tasks.filter(
              t =>
                t.user_id ===
                uid
            );


          const memberIssues =
            issues.filter(
              i =>
                i.assigned_to ===
                uid
            );


          const completed =
            memberTasks.filter(
              t =>
                t.done
            ).length;


          const bookedGross =
            booked.reduce(
              (
                sum,
                l
              ) =>
                sum +
                Number(
                  l.rate || 0
                ),
              0
            );


          const lastAction =
            activity.find(
              a =>
                a.user_id ===
                uid
            );


          return `
            <article class="card member-card">

              <div class="top">

                <div>

                  <p class="eyebrow">
                    ${
                      online
                        ? '🟢 ONLINE'
                        : '⚪ OFFLINE'
                    }
                  </p>

                  <h3>
                    ${esc(
                      m.profiles
                        ?.display_name ||
                      'Member'
                    )}
                  </h3>

                  <div class="meta">

                    ${roleLabel(
                      m.role
                    )}

                    ·

                    ${
                      m.profiles
                        ?.shift_active
                        ? '🚦 Shift ON'
                        : 'Shift OFF'
                    }

                  </div>

                </div>


                <div class="avatar">
                  ${esc(
                    (
                      m.profiles
                        ?.display_name ||
                      'M'
                    )[0]
                      .toUpperCase()
                  )}
                </div>

              </div>


              <div class="metric-row">

                <div class="metric">

                  <small>
                    📦 Loads booked
                  </small>

                  <strong>
                    ${booked.length}
                  </strong>

                </div>


                <div class="metric">

                  <small>
                    💵 Booked gross
                  </small>

                  <strong>
                    ${money(
                      bookedGross
                    )}
                  </strong>

                </div>


                <div class="metric">

                  <small>
                    🎯 Tasks
                  </small>

                  <strong>
                    ${completed}/${memberTasks.length}
                  </strong>

                </div>


                <div class="metric">

                  <small>
                    🚨 Open issues
                  </small>

                  <strong>
                    ${
                      memberIssues.filter(
                        i =>
                          !i.solved
                      ).length
                    }
                  </strong>

                </div>


                <div class="metric">

                  <small>
                    🕒 Last seen
                  </small>

                  <strong>
                    ${relativeTime(
                      m.profiles
                        ?.last_seen
                    )}
                  </strong>

                </div>

              </div>


              <div
                class="notice"
                style="margin-top:12px"
              >

                <b>
                  Last action:
                </b>

                ${
                  lastAction
                    ? esc(
                        lastAction.action +
                        (
                          lastAction.details
                            ? ' · ' +
                              lastAction.details
                            : ''
                        )
                      )
                    : 'No recorded action yet'
                }

              </div>


              <div
                class="meta"
                style="margin-top:8px"
              >

                Assigned loads:
                ${assigned.length}

                ·

                XP:
                ${m.profiles?.xp || 0}

              </div>

            </article>
          `;
        }
      )
      .join('');


  if (
    $('adminLiveTeam')
  ) {

    $('adminLiveTeam')
      .innerHTML =
        liveCards ||

        '<div class="card muted">No active team members.</div>';
  }


  const rows =
    active
      .map(
        m => {

          const uid =
            m.user_id;


          const booked =
            loads.filter(
              l =>
                l.created_by ===
                uid
            );


          const assigned =
            loads.filter(
              l =>
                l.assigned_to ===
                uid
            );


          const memberIssues =
            issues.filter(
              i =>
                i.assigned_to ===
                uid
            );


          const memberTasks =
            tasks.filter(
              t =>
                t.user_id ===
                uid
            );


          const gross =
            assigned.reduce(
              (
                sum,
                l
              ) =>
                sum +
                Number(
                  l.rate || 0
                ),
              0
            );


          const miles =
            assigned.reduce(
              (
                sum,
                l
              ) =>
                sum +
                Number(
                  l.loaded_miles ||
                  0
                ),
              0
            );


          const lastAction =
            activity.find(
              a =>
                a.user_id ===
                uid
            );


          return `
            <tr>

              <td>

                <b>
                  ${esc(
                    m.profiles
                      ?.display_name ||
                    'Member'
                  )}
                </b>

                <br>

                <span class="meta">
                  ${roleLabel(
                    m.role
                  )}
                </span>

              </td>


              <td>

                ${
                  isOnline(m)
                    ? '🟢 Online'
                    : '⚪ Offline'
                }

                <br>

                <span class="meta">

                  ${relativeTime(
                    m.profiles
                      ?.last_seen
                  )}

                </span>

              </td>


              <td>
                ${booked.length}
              </td>


              <td>
                ${assigned.length}
              </td>


              <td>
                ${money(
                  gross
                )}
              </td>


              <td>

                ${
                  miles
                    ? '$' +
                      (
                        gross /
                        miles
                      ).toFixed(2)
                    : '$0.00'
                }

              </td>


              <td>

                ${
                  memberIssues.filter(
                    i =>
                      !i.solved
                  ).length
                }

              </td>


              <td>

                ${
                  memberTasks.filter(
                    t =>
                      t.done
                  ).length
                }

                /

                ${memberTasks.length}

              </td>


              <td>
                ${m.profiles?.xp || 0}
              </td>


              <td>
                ${
                  m.profiles
                    ?.shift_active
                    ? '🟢 ON'
                    : '⚪ OFF'
                }
              </td>


              <td>
                ${esc(
                  lastAction?.action ||
                  '—'
                )}
              </td>

            </tr>
          `;
        }
      )
      .join('');


  $('adminScoreboard')
    .innerHTML = `

      <table class="data-table">

        <thead>

          <tr>

            <th>Member</th>

            <th>Status</th>

            <th>Booked</th>

            <th>Assigned Loads</th>

            <th>Gross</th>

            <th>RPM</th>

            <th>Open Issues</th>

            <th>Tasks</th>

            <th>XP</th>

            <th>Shift</th>

            <th>Last Action</th>

          </tr>

        </thead>

        <tbody>
          ${rows}
        </tbody>

      </table>
    `;
}


/* ============================================================
   START
============================================================ */

init();
