const $ = id => document.getElementById(id);

let sb = null;
let user = null;
let profile = null;
let org = null;
let myMembership = null;

let members = [];
let carriers = [];
let trucks = [];
let loads = [];
let issues = [];
let tasks = [];
let cases = [];
let learning = [];
let activity = [];
let loadDocuments = [];

let currentPanel = 'dashboard';
let carrierFilter = 'all';
let editingLoadId = null;

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

    carriers: [
      'CLIENT COMPANIES',
      'Carriers & Owner Operators'
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
  carriers = [];
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


  ensureLoadCancelButton();
  renderShift();
  ensureCarrierFilter();
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
    carrierResult,
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
        .from('carriers')
        .select('*')
        .eq(
          'org_id',
          oid
        )
        .order(
          'company_name',
          {
            ascending:
              true
          }
        ),

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
          '*,trucks(truck_no,driver_name,carrier_id)'
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
          '*,trucks(truck_no,driver_name,carrier_id)'
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
    carrierResult,
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

  carriers =
    carrierResult.data ||
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


function carrierName(carrierId) {

  if (!carrierId) {
    return 'Unassigned Carrier';
  }


  const carrier =
    carriers.find(
      c =>
        String(c.id) ===
        String(carrierId)
    );


  return (
    carrier?.company_name ||
    'Unknown Carrier'
  );
}


function filteredTrucks() {

  if (
    carrierFilter ===
    'all'
  ) {
    return trucks;
  }


  return trucks.filter(
    t =>
      String(
        t.carrier_id ||
        ''
      ) ===
      String(
        carrierFilter
      )
  );
}


function filteredLoads() {

  if (
    carrierFilter ===
    'all'
  ) {
    return loads;
  }


  return loads.filter(
    l =>
      String(
        l.trucks
          ?.carrier_id ||
        ''
      ) ===
      String(
        carrierFilter
      )
  );
}


function filteredIssues() {

  if (
    carrierFilter ===
    'all'
  ) {
    return issues;
  }


  return issues.filter(
    i =>
      String(
        i.trucks
          ?.carrier_id ||
        ''
      ) ===
      String(
        carrierFilter
      )
  );
}


/* ============================================================
   CARRIER FILTER
============================================================ */

function ensureCarrierFilter() {

  const topActions =
    document.querySelector(
      '.top-actions'
    );


  if (
    !topActions ||
    $('globalCarrierFilter')
  ) {
    return;
  }


  const wrap =
    document.createElement(
      'label'
    );


  wrap.id =
    'carrierFilterWrap';


  wrap.style.minWidth =
    '210px';


  wrap.style.margin =
    '0';


  wrap.innerHTML = `
    <span style="font-size:.72rem">
      🏢 Carrier View
    </span>

    <select id="globalCarrierFilter">
      <option value="all">
        All Companies
      </option>
    </select>
  `;


  topActions.insertBefore(
    wrap,
    topActions.firstChild
  );


  $('globalCarrierFilter')
    .addEventListener(
      'change',
      e => {

        carrierFilter =
          e.target.value;


        renderDashboard();
        renderFleet();
        renderLoads();
        renderIssues();
      }
    );
}


function refreshCarrierFilterOptions() {

  ensureCarrierFilter();


  const select =
    $('globalCarrierFilter');


  if (!select) return;


  const current =
    carrierFilter;


  select.innerHTML =
    '<option value="all">All Companies</option>' +

    carriers
      .filter(
        c =>
          c.status ===
          'active'
      )
      .map(
        c => `
          <option value="${c.id}">
            ${esc(
              c.company_name
            )}
          </option>
        `
      )
      .join('');


  select.value =
    carriers.some(
      c =>
        String(c.id) ===
        String(current)
    )
      ? current
      : 'all';


  carrierFilter =
    select.value;
}


/* ============================================================
   POPULATE DROPDOWNS
============================================================ */

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


  const truckCarrier =
    $('truckCarrier');


  if (truckCarrier) {

    truckCarrier.innerHTML =
      '<option value="">Choose carrier</option>' +

      carriers
        .filter(
          c =>
            c.status ===
            'active'
        )
        .map(
          c => `
            <option value="${c.id}">
              ${esc(
                c.company_name
              )}
            </option>
          `
        )
        .join('');
  }


  refreshCarrierFilterOptions();


  $('loadTruck')
    .innerHTML =
      '<option value="">Choose truck</option>' +

      trucks
        .map(
          t => `
            <option value="${t.id}">
              ${esc(
                carrierName(
                  t.carrier_id
                )
              )}
              ·
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
                carrierName(
                  t.carrier_id
                )
              )}
              ·
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
  if (!org || myMembership?.role !== 'admin') return;

  setSync('📡 Updating team…');

  const oid = org.id;

  const [
    memberRows,
    carrierResult,
    loadResult,
    issueResult,
    taskResult,
    activityResult,
    documentResult
  ] = await Promise.all([
    fetchMembersWithProfiles(),

    sb
      .from('carriers')
      .select('*')
      .eq('org_id', oid)
      .order('company_name', { ascending: true }),

    sb
      .from('loads')
      .select('*,trucks(truck_no,driver_name,carrier_id)')
      .eq('org_id', oid)
      .order('created_at', { ascending: false }),

    sb
      .from('issues')
      .select('*,trucks(truck_no,driver_name,carrier_id)')
      .eq('org_id', oid)
      .order('created_at', { ascending: false }),

    sb
      .from('tasks')
      .select('*')
      .eq('org_id', oid)
      .order('created_at', { ascending: false }),

    sb
      .from('activity_logs')
      .select('*')
      .eq('org_id', oid)
      .order('created_at', { ascending: false })
      .limit(50),

    sb
      .from('load_documents')
      .select('*')
      .eq('org_id', oid)
      .order('created_at', { ascending: false })
  ]);

  members = memberRows || members;
  carriers = carrierResult.data || carriers;
  loads = loadResult.data || loads;
  issues = issueResult.data || issues;
  tasks = taskResult.data || tasks;
  activity = activityResult.data || activity;
  loadDocuments = documentResult.data || loadDocuments;

  populateSelects();
  renderTeam();
  renderAdmin();
  renderActivity();
  renderCarriers();

  setSync(
    '🟢 Live · ' +
    new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  );
}


/* ============================================================
   SHIFT
============================================================ */

$('shiftBtn').addEventListener('click', async () => {
  profile.shift_active = !profile.shift_active;

  const now = new Date().toISOString();

  const { error } = await sb
    .from('profiles')
    .update({
      shift_active: profile.shift_active,
      last_seen: now
    })
    .eq('id', user.id);

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  profile.last_seen = now;

  const me = members.find(m => m.user_id === user.id);

  if (me?.profiles) {
    me.profiles.shift_active = profile.shift_active;
    me.profiles.last_seen = now;
  }

  await logAction(
    profile.shift_active ? 'Started shift' : 'Ended shift',
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
});


function renderShift() {
  $('shiftBtn').textContent =
    profile?.shift_active
      ? '🔴 End Shift'
      : '🟢 Start Shift';
}


/* ============================================================
   CARRIER FORM
============================================================ */

if ($('carrierForm')) {
  $('carrierForm').addEventListener('submit', async e => {
    e.preventDefault();

    if (!['admin', 'dispatcher'].includes(myMembership?.role)) {
      toast('❌ You cannot add carriers');
      return;
    }

    const payload = {
      org_id: org.id,
      company_name: $('carrierName').value.trim(),
      mc_number: $('carrierMC').value.trim() || null,
      dot_number: $('carrierDOT').value.trim() || null,
      contact_name: $('carrierContact').value.trim() || null,
      phone: $('carrierPhone').value.trim() || null,
      email: $('carrierEmail').value.trim() || null,
      address: $('carrierAddress').value.trim() || null,
      notes: $('carrierNotes').value.trim() || null,
      status: $('carrierStatus').value,
      created_by: user.id
    };

    if (!payload.company_name) {
      toast('⚠️ Company name is required');
      return;
    }

    const { data, error } = await sb
      .from('carriers')
      .insert(payload)
      .select()
      .single();

    if (error) {
      toast('❌ ' + error.message);
      return;
    }

    await logAction(
      'Added carrier',
      'carrier',
      data.id,
      payload.company_name
    );

    e.target.reset();

    $('carrierFormCard')?.classList.add('hidden');

    await loadWorkspaceData();

    toast('🏢 Carrier added');
  });
}


/* ============================================================
   TRUCK FORM
============================================================ */

$('truckForm').addEventListener('submit', async e => {
  e.preventDefault();

  const selectedCarrier =
    $('truckCarrier')?.value || null;

  if (!selectedCarrier) {
    toast('⚠️ Choose a carrier first');
    return;
  }

  const payload = {
    org_id: org.id,
    carrier_id: selectedCarrier,
    truck_no: $('truckNo').value.trim(),
    driver_name: $('truckDriver').value.trim(),
    equipment: $('truckEquipment').value,
    driver_type: $('driverType').value,
    current_location: $('truckLocation').value.trim(),
    status: $('truckStatus').value,
    assigned_to: $('truckAssigned').value || null,
    daily_target: Number($('truckTarget').value || 0),
    created_by: user.id
  };

  const { data, error } = await sb
    .from('trucks')
    .insert(payload)
    .select()
    .single();

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  await gainXP(5);

  await logAction(
    'Added truck',
    'truck',
    data.id,
    `${carrierName(payload.carrier_id)} · Truck ${payload.truck_no}`
  );

  e.target.reset();
  $('truckFormCard').classList.add('hidden');

  await loadWorkspaceData();

  toast('🚚 Truck added');
});


/* ============================================================
   FULL LOAD EDITING
============================================================ */

function toDateTimeLocalValue(value) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const pad = n => String(n).padStart(2, '0');

  return (
    `${date.getFullYear()}-` +
    `${pad(date.getMonth() + 1)}-` +
    `${pad(date.getDate())}T` +
    `${pad(date.getHours())}:` +
    `${pad(date.getMinutes())}`
  );
}


function loadSubmitButton() {
  return $('loadForm')?.querySelector(
    'button[type="submit"], button:not([type])'
  );
}


function ensureLoadCancelButton() {
  const form = $('loadForm');

  if (!form || $('cancelLoadEdit')) return;

  const button = document.createElement('button');

  button.id = 'cancelLoadEdit';
  button.type = 'button';
  button.className = 'btn ghost wide hidden';
  button.textContent = '✖ Cancel Edit';

  button.addEventListener('click', () => {
    resetLoadFormMode(true);
    toast('Edit cancelled');
  });

  form.appendChild(button);
}


function resetLoadFormMode(closeCard = false) {
  editingLoadId = null;

  $('loadForm')?.reset();

  updateLoadRatePreview();

  const submit = loadSubmitButton();

  if (submit) {
    submit.textContent = '💾 Save Load';
  }

  $('cancelLoadEdit')?.classList.add('hidden');

  if (closeCard) {
    $('loadFormCard')?.classList.add('hidden');
  }
}


function updateLoadRatePreview() {
  const companyRate =
    Number(
      $('loadRate')?.value || 0
    );

  const driverRate =
    Number(
      $('loadDriverRate')?.value || 0
    );

  const loadedMiles =
    Number(
      $('loadMiles')?.value || 0
    );

  const margin =
    companyRate - driverRate;

  const companyRPM =
    loadedMiles
      ? companyRate / loadedMiles
      : 0;

  const driverRPM =
    loadedMiles
      ? driverRate / loadedMiles
      : 0;

  if ($('loadMarginPreview')) {
    $('loadMarginPreview').textContent =
      money(margin);
  }

  if ($('loadRatePreview')) {
    $('loadRatePreview').textContent =
      `Company RPM $${companyRPM.toFixed(2)} · Driver RPM $${driverRPM.toFixed(2)}`;
  }
}


[
  'loadRate',
  'loadDriverRate',
  'loadMiles'
].forEach(id => {
  $(id)?.addEventListener(
    'input',
    updateLoadRatePreview
  );
});


function beginLoadEdit(loadId) {
  const load = loads.find(
    x => String(x.id) === String(loadId)
  );

  if (!load) {
    toast('❌ Load not found');
    return;
  }

  if (!['admin', 'dispatcher'].includes(myMembership?.role)) {
    toast('❌ You cannot edit loads');
    return;
  }

  editingLoadId = load.id;

  ensureLoadCancelButton();

  $('loadTruck').value = load.truck_id || '';
  $('loadBroker').value = load.broker || '';
  $('loadRate').value = load.rate ?? '';

  if ($('loadDriverRate')) {
    $('loadDriverRate').value =
      load.driver_rate ?? 0;
  }

  $('loadSource').value = load.source || 'DAT';
  $('loadOrigin').value = load.origin || '';
  $('loadDestination').value = load.destination || '';
  $('loadMiles').value = load.loaded_miles ?? '';
  $('loadDeadhead').value = load.deadhead_miles ?? 0;

  $('pickupAt').value =
    toDateTimeLocalValue(load.pickup_at);

  $('deliveryAt').value =
    toDateTimeLocalValue(load.delivery_at);

  $('loadRef').value =
    load.reference_no || '';

  $('loadAssigned').value =
    load.assigned_to || user.id;

  $('loadStatus').value =
    load.status || 'Booked';

  $('loadNotes').value =
    load.notes || '';

  updateLoadRatePreview();

  if ($('loadDocumentType')) {
    $('loadDocumentType').value = 'RC';
  }

  if ($('loadDocumentFile')) {
    $('loadDocumentFile').value = '';
  }

  const submit = loadSubmitButton();

  if (submit) {
    submit.textContent = '✅ Update Load';
  }

  $('cancelLoadEdit')?.classList.remove('hidden');

  $('loadFormCard')?.classList.remove('hidden');

  showPanel('loads');

  $('loadFormCard')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start'
  });

  toast('✏️ Editing load');
}


$('loadForm').addEventListener('submit', async e => {
  e.preventDefault();

  const documentFile =
    $('loadDocumentFile')?.files?.[0] || null;

  const documentType =
    $('loadDocumentType')?.value || 'RC';

  const truckId =
    $('loadTruck').value || null;

  const selectedTruck =
    trucks.find(
      t =>
        String(t.id) ===
        String(truckId)
    );

  const editablePayload = {
    truck_id: truckId,

    broker:
      $('loadBroker').value.trim(),

    rate:
      Number($('loadRate').value || 0),

    driver_rate:
      Number(
        $('loadDriverRate')?.value || 0
      ),

    source:
      $('loadSource').value,

    origin:
      $('loadOrigin').value.trim(),

    destination:
      $('loadDestination').value.trim(),

    loaded_miles:
      Number($('loadMiles').value || 0),

    deadhead_miles:
      Number($('loadDeadhead').value || 0),

    pickup_at:
      $('pickupAt').value
        ? new Date(
            $('pickupAt').value
          ).toISOString()
        : null,

    delivery_at:
      $('deliveryAt').value
        ? new Date(
            $('deliveryAt').value
          ).toISOString()
        : null,

    reference_no:
      $('loadRef').value.trim(),

    assigned_to:
      $('loadAssigned').value || user.id,

    status:
      $('loadStatus').value,

    notes:
      $('loadNotes').value.trim()
  };

  const wasEditing =
    Boolean(editingLoadId);

  const targetLoadId =
    editingLoadId;

  let data;
  let error;

  if (wasEditing) {
    const result = await sb
      .from('loads')
      .update({
        ...editablePayload,
        updated_at: new Date().toISOString()
      })
      .eq('id', targetLoadId)
      .eq('org_id', org.id)
      .select()
      .single();

    data = result.data;
    error = result.error;

  } else {
    const result = await sb
      .from('loads')
      .insert({
        org_id: org.id,
        ...editablePayload,
        created_by: user.id
      })
      .select()
      .single();

    data = result.data;
    error = result.error;
  }

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  if (!wasEditing) {
    await gainXP(10);
  }

  await logAction(
    wasEditing
      ? 'Edited load'
      : 'Booked load',
    'load',
    data.id,
    `${
      selectedTruck
        ? carrierName(
            selectedTruck.carrier_id
          ) + ' · '
        : ''
    }${editablePayload.origin} → ${editablePayload.destination} · ${money(
      editablePayload.rate
    )}`
  );

  if (documentFile) {
    await uploadLoadDocument(
      data.id,
      documentFile,
      documentType
    );
  }

  resetLoadFormMode(true);

  await loadWorkspaceData();

  if (
    editablePayload.status === 'Delivered' &&
    !hasLoadDoc(data.id, 'POD')
  ) {
    toast(
      wasEditing
        ? '✅ Load updated — 🚨 POD is still missing'
        : '📦 Load saved — 🚨 POD is still missing'
    );
  } else {
    toast(
      wasEditing
        ? '✅ Load updated'
        : '📦 Load saved'
    );
  }
});


/* ============================================================
   ISSUE FORM
============================================================ */

$('issueForm').addEventListener('submit', async e => {
  e.preventDefault();

  const payload = {
    org_id: org.id,
    title: $('issueTitle').value.trim(),
    issue_type: $('issueType').value,
    priority: $('issuePriority').value,
    details: $('issueDetails').value.trim(),
    next_action: $('issueNext').value.trim(),
    truck_id: $('issueTruck').value || null,
    assigned_to: $('issueAssigned').value || user.id,
    created_by: user.id
  };

  const { data, error } = await sb
    .from('issues')
    .insert(payload)
    .select()
    .single();

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  await logAction(
    'Opened issue',
    'issue',
    data.id,
    payload.title
  );

  e.target.reset();
  $('issueFormCard').classList.add('hidden');

  await loadWorkspaceData();

  toast('🚨 Issue opened');
});


/* ============================================================
   TASK FORMS
============================================================ */

async function addTask(
  title,
  category = 'Dispatch',
  priority = 'Medium',
  due = null,
  notes = ''
) {
  const { data, error } = await sb
    .from('tasks')
    .insert({
      org_id: org.id,
      user_id: user.id,
      title,
      category,
      priority,
      due_date: due || null,
      notes
    })
    .select()
    .single();

  if (error) {
    toast('❌ ' + error.message);
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


$('quickTaskForm').addEventListener('submit', async e => {
  e.preventDefault();

  const value =
    $('quickTask').value.trim();

  if (!value) return;

  await addTask(value);

  $('quickTask').value = '';
});


$('taskForm').addEventListener('submit', async e => {
  e.preventDefault();

  await addTask(
    $('taskTitle').value.trim(),
    $('taskCategory').value,
    $('taskPriority').value,
    $('taskDue').value,
    $('taskNotes').value.trim()
  );

  e.target.reset();

  $('taskFormCard').classList.add('hidden');
});


/* ============================================================
   CASE FORM
============================================================ */

$('caseForm').addEventListener('submit', async e => {
  e.preventDefault();

  const payload = {
    org_id: org.id,
    user_id: user.id,
    problem: $('caseProblem').value.trim(),
    category: $('caseCategory').value.trim(),
    solution: $('caseSolution').value.trim(),
    lesson: $('caseLesson').value.trim(),
    tags: $('caseTags').value.trim(),
    visibility: $('caseVisibility').value
  };

  const { data, error } = await sb
    .from('cases')
    .insert(payload)
    .select()
    .single();

  if (error) {
    toast('❌ ' + error.message);
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

  $('caseFormCard').classList.add('hidden');

  await loadWorkspaceData();

  toast('🧠 Case saved');
});


$('caseSearch').addEventListener(
  'input',
  renderCases
);

$('caseScope').addEventListener(
  'change',
  renderCases
);


/* ============================================================
   LEARNING FORM
============================================================ */

$('learningForm').addEventListener('submit', async e => {
  e.preventDefault();

  const payload = {
    org_id: org.id,
    user_id: user.id,
    topic: $('learnTopic').value.trim(),
    source: $('learnSource').value.trim(),
    note: $('learnNote').value.trim(),
    question: $('learnQuestion').value.trim()
  };

  const { data, error } = await sb
    .from('learning_notes')
    .insert(payload)
    .select()
    .single();

  if (error) {
    toast('❌ ' + error.message);
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

  $('learningFormCard').classList.add('hidden');

  await loadWorkspaceData();

  toast('🎓 Learning saved');
});


/* ============================================================
   RENDER ALL
============================================================ */

function renderAll() {
  refreshCarrierFilterOptions();

  renderDashboard();
  renderCarriers();
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
  if (!profile || !user) return;

  const visibleTrucks =
    filteredTrucks();

  const visibleLoads =
    filteredLoads();

  const visibleIssues =
    filteredIssues();

  const activeLoads =
    visibleLoads.filter(
      l =>
        ![
          'Delivered',
          'Cancelled'
        ].includes(l.status)
    );

  const gross =
    visibleLoads.reduce(
      (sum, l) =>
        sum +
        Number(l.rate || 0),
      0
    );

  const miles =
    visibleLoads.reduce(
      (sum, l) =>
        sum +
        Number(l.loaded_miles || 0),
      0
    );

  const openIssues =
    visibleIssues.filter(
      i => !i.solved
    );

  const mine =
    tasks.filter(
      t =>
        t.user_id === user.id
    );

  const assignedTrucks =
    visibleTrucks.filter(
      t =>
        t.assigned_to === user.id
    );

  const selectedCarrier =
    carrierFilter === 'all'
      ? null
      : carriers.find(
          c =>
            String(c.id) ===
            String(carrierFilter)
        );

  $('welcomeTitle').textContent =
    `${
      profile.shift_active
        ? 'Shift is live'
        : 'Ready to dispatch'
    }, ${profile.display_name}?`;

  if ($('welcomeSub')) {
    $('welcomeSub').textContent =
      selectedCarrier
        ? `Viewing ${selectedCarrier.company_name} — trucks, loads and issues are filtered to this carrier.`
        : 'Protect service, keep trucks moving, document what you learn.';
  }

  $('xpValue').textContent =
    profile.xp || 0;

  const xp =
    Number(profile.xp || 0);

  $('levelText').textContent =
    xp >= 1000
      ? 'Operations Commander'
      : xp >= 500
      ? 'Fleet Controller'
      : xp >= 250
      ? 'Senior Dispatcher'
      : xp >= 100
      ? 'Dispatcher Specialist'
      : 'Rookie Dispatcher';

  $('statTrucks').textContent =
    visibleTrucks.length;

  $('statAssigned').textContent =
    `${assignedTrucks.length} assigned to you`;

  $('statLoads').textContent =
    activeLoads.length;

  $('statLoadGross').textContent =
    `${money(
      activeLoads.reduce(
        (sum, l) =>
          sum + Number(l.rate || 0),
        0
      )
    )} active gross`;

  $('statGross').textContent =
    money(gross);

  $('statRpm').textContent =
    miles
      ? `$${(gross / miles).toFixed(2)} avg RPM`
      : '$0.00 avg RPM';

  $('statIssues').textContent =
    openIssues.length;

  $('statCritical').textContent =
    `${
      openIssues.filter(
        i =>
          i.priority === 'Critical'
      ).length
    } critical`;

  $('taskDone').textContent =
    mine.filter(t => t.done).length;

  $('taskTotal').textContent =
    mine.length;

  $('dashboardTasks').innerHTML =
    mine
      .slice(0, 6)
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
    visibleTrucks.filter(
      t =>
        t.status === 'Available'
    ).length;

  const critical =
    openIssues.filter(
      i =>
        i.priority === 'Critical'
    ).length;

  const overdue =
    mine.filter(
      t =>
        !t.done &&
        t.due_date &&
        t.due_date <
          new Date()
            .toISOString()
            .slice(0, 10)
    ).length;

  $('attentionRadar').innerHTML = [
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
      '🏢 Active Carriers',
      carriers.filter(
        c =>
          c.status === 'active'
      ).length,
      'Client companies'
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

  $('dashboardLoads').innerHTML =
    loadTable(
      activeLoads.slice(0, 8),
      false
    );
}


/* ============================================================
   BADGES
============================================================ */

function statusBadge(s) {
  const cls =
    [
      'Available',
      'Delivered',
      'Covered',
      'Resolved',
      'active'
    ].includes(s)
      ? 'good'
      : [
          'Breakdown',
          'Cancelled',
          'Critical',
          'inactive'
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
   CARRIER HELPERS
============================================================ */

function carrierTrucks(carrierId) {
  return trucks.filter(
    t =>
      String(t.carrier_id || '') ===
      String(carrierId)
  );
}


function carrierLoads(carrierId) {
  return loads.filter(
    l =>
      String(
        l.trucks?.carrier_id || ''
      ) ===
      String(carrierId)
  );
}


/* ============================================================
   CARRIER CARDS
============================================================ */

function renderCarriers() {
  const grid = $('carrierGrid');

  if (!grid) return;

  grid.innerHTML =
    carriers
      .map(c => {
        const carrierTruckList =
          carrierTrucks(c.id);

        const carrierLoadList =
          carrierLoads(c.id);

        const activeLoadList =
          carrierLoadList.filter(
            l =>
              ![
                'Delivered',
                'Cancelled'
              ].includes(l.status)
          );

        const delivered =
          carrierLoadList.filter(
            l =>
              l.status === 'Delivered'
          ).length;

        const gross =
          carrierLoadList.reduce(
            (sum, l) =>
              sum +
              Number(l.rate || 0),
            0
          );

        const available =
          carrierTruckList.filter(
            t =>
              t.status === 'Available'
          ).length;

        return `
          <article class="card carrier-card">

            <div class="top">

              <div>
                <p class="eyebrow">
                  🏢 CARRIER / CLIENT
                </p>

                <h3>
                  ${esc(c.company_name)}
                </h3>

                <div class="meta">
                  MC:
                  ${esc(c.mc_number || '—')}
                  ·
                  DOT:
                  ${esc(c.dot_number || '—')}
                </div>
              </div>

              ${statusBadge(c.status)}

            </div>


            <div class="metric-row">

              <div class="metric">
                <small>🚚 Trucks</small>
                <strong>${carrierTruckList.length}</strong>
              </div>

              <div class="metric">
                <small>🟢 Available</small>
                <strong>${available}</strong>
              </div>

              <div class="metric">
                <small>📦 Active Loads</small>
                <strong>${activeLoadList.length}</strong>
              </div>

              <div class="metric">
                <small>✅ Delivered</small>
                <strong>${delivered}</strong>
              </div>

              <div class="metric">
                <small>💰 Gross</small>
                <strong>${money(gross)}</strong>
              </div>

            </div>


            ${
              c.contact_name
                ? `
                  <div class="meta">
                    👤 ${esc(c.contact_name)}
                  </div>
                `
                : ''
            }

            ${
              c.phone
                ? `
                  <div class="meta">
                    📞 ${esc(c.phone)}
                  </div>
                `
                : ''
            }

            ${
              c.email
                ? `
                  <div class="meta">
                    ✉️ ${esc(c.email)}
                  </div>
                `
                : ''
            }

            ${
              c.address
                ? `
                  <div class="meta">
                    📍 ${esc(c.address)}
                  </div>
                `
                : ''
            }

            ${
              c.notes
                ? `
                  <div class="notice">
                    📝 ${esc(c.notes)}
                  </div>
                `
                : ''
            }


            <div
              style="
                display:flex;
                gap:8px;
                flex-wrap:wrap;
                margin-top:12px;
              "
            >

              <button
                class="btn ghost carrier-view"
                data-carrier="${c.id}"
                type="button"
              >
                👁 View Operation
              </button>

              ${
                ['admin', 'dispatcher'].includes(
                  myMembership?.role
                )
                  ? `
                    <button
                      class="btn ghost carrier-toggle-status"
                      data-carrier="${c.id}"
                      type="button"
                    >
                      ${
                        c.status === 'active'
                          ? '⚪ Set Inactive'
                          : '🟢 Set Active'
                      }
                    </button>
                  `
                  : ''
              }

            </div>

          </article>
        `;
      })
      .join('') ||
    `
      <div class="card muted">
        No carriers yet.
      </div>
    `;


  document
    .querySelectorAll('.carrier-view')
    .forEach(button => {
      button.addEventListener('click', () => {
        carrierFilter =
          button.dataset.carrier;

        refreshCarrierFilterOptions();

        renderDashboard();
        renderFleet();
        renderLoads();
        renderIssues();

        showPanel('dashboard');

        toast(
          `🏢 Viewing ${carrierName(
            carrierFilter
          )}`
        );
      });
    });


  document
    .querySelectorAll(
      '.carrier-toggle-status'
    )
    .forEach(button => {
      button.addEventListener('click', async () => {
        const carrier =
          carriers.find(
            c =>
              String(c.id) ===
              String(
                button.dataset.carrier
              )
          );

        if (!carrier) return;

        const newStatus =
          carrier.status === 'active'
            ? 'inactive'
            : 'active';

        const { error } = await sb
          .from('carriers')
          .update({
            status: newStatus,
            updated_at:
              new Date().toISOString()
          })
          .eq('id', carrier.id)
          .eq('org_id', org.id);

        if (error) {
          toast('❌ ' + error.message);
          return;
        }

        await logAction(
          'Updated carrier status',
          'carrier',
          carrier.id,
          `${carrier.company_name} → ${newStatus}`
        );

        await loadWorkspaceData();
      });
    });
}


/* ============================================================
   FLEET
============================================================ */

function renderFleet() {
  const visibleTrucks =
    filteredTrucks();

  $('fleetGrid').innerHTML =
    visibleTrucks
      .map(
        t => `
          <article class="card truck-card">

            <div class="top">

              <div>
                <p class="eyebrow">
                  🏢
                  ${esc(
                    carrierName(
                      t.carrier_id
                    )
                  )}
                </p>

                <h3>
                  🚚 Truck ${esc(t.truck_no)}
                </h3>

                <div class="meta">
                  👤 ${esc(t.driver_name)}
                  · ${esc(t.equipment)}
                  · ${esc(t.driver_type)}
                </div>
              </div>

              ${statusBadge(t.status)}

            </div>


            <div class="metric-row">

              <div class="metric">
                <small>📍 Location</small>
                <strong>
                  ${esc(
                    t.current_location ||
                    'Not set'
                  )}
                </strong>
              </div>

              <div class="metric">
                <small>👤 Dispatcher</small>
                <strong>
                  ${esc(
                    memberName(
                      t.assigned_to
                    )
                  )}
                </strong>
              </div>

              <div class="metric">
                <small>🎯 Daily Target</small>
                <strong>
                  ${money(t.daily_target)}
                </strong>
              </div>

            </div>

          </article>
        `
      )
      .join('') ||
    `
      <div class="card muted">
        No trucks found.
      </div>
    `;
}


/* ============================================================
   LOAD DOCUMENT HELPERS
============================================================ */

function loadDocs(loadId) {
  return loadDocuments.filter(
    d =>
      String(d.load_id) ===
      String(loadId)
  );
}


function hasLoadDoc(loadId, type) {
  return loadDocs(loadId).some(
    d =>
      d.document_type === type
  );
}


function documentIcon(type) {
  if (type === 'RC') return '📄';
  if (type === 'BOL') return '📋';
  if (type === 'POD') return '✅';
  if (type === 'Lumper') return '💵';

  return '📎';
}


function safeFileName(name) {
  return String(
    name || 'document'
  ).replace(
    /[^a-zA-Z0-9._-]/g,
    '_'
  );
}


/* ============================================================
   DOCUMENT UPLOAD
============================================================ */

async function uploadLoadDocument(
  loadId,
  file,
  type
) {
  if (!file) return false;

  if (
    !['admin', 'dispatcher'].includes(
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
    !allowedTypes.includes(file.type)
  ) {
    toast(
      '❌ Use PDF, JPG, PNG or WEBP'
    );
    return false;
  }

  if (
    file.size >
    20 * 1024 * 1024
  ) {
    toast(
      '❌ Maximum document size is 20 MB'
    );
    return false;
  }

  const unique =
    window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random()
          .toString(16)
          .slice(2)}`;

  const path =
    `${org.id}/${loadId}/` +
    `${unique}-${safeFileName(
      file.name
    )}`;

  const {
    error: uploadError
  } = await sb.storage
    .from('load-documents')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (uploadError) {
    toast(
      '❌ Upload failed: ' +
      uploadError.message
    );
    return false;
  }

  const {
    data,
    error
  } = await sb
    .from('load_documents')
    .insert({
      org_id: org.id,
      load_id: loadId,
      uploaded_by: user.id,
      document_type: type,
      file_name: file.name,
      storage_path: path
    })
    .select()
    .single();

  if (error) {
    await sb.storage
      .from('load-documents')
      .remove([path]);

    toast(
      '❌ Document record failed: ' +
      error.message
    );

    return false;
  }

  loadDocuments.unshift(data);

  await logAction(
    `Uploaded ${type}`,
    'load',
    loadId,
    file.name
  );

  toast(
    `✅ ${type} uploaded`
  );

  return true;
}


async function openLoadDocument(documentId) {
  const doc =
    loadDocuments.find(
      d =>
        String(d.id) ===
        String(documentId)
    );

  if (!doc) return;

  const { data, error } =
    await sb.storage
      .from('load-documents')
      .createSignedUrl(
        doc.storage_path,
        300
      );

  if (error) {
    toast(
      '❌ Cannot open document: ' +
      error.message
    );
    return;
  }

  window.open(
    data.signedUrl,
    '_blank',
    'noopener,noreferrer'
  );
}


async function deleteLoadDocument(documentId) {
  if (
    !['admin', 'dispatcher'].includes(
      myMembership?.role
    )
  ) {
    return;
  }

  const doc =
    loadDocuments.find(
      d =>
        String(d.id) ===
        String(documentId)
    );

  if (!doc) return;

  if (
    !window.confirm(
      `Delete ${doc.document_type} — ${doc.file_name}?`
    )
  ) {
    return;
  }

  const { error } = await sb
    .from('load_documents')
    .delete()
    .eq('id', doc.id);

  if (error) {
    toast('❌ ' + error.message);
    return;
  }

  await sb.storage
    .from('load-documents')
    .remove([
      doc.storage_path
    ]);

  await logAction(
    `Deleted ${doc.document_type}`,
    'load',
    doc.load_id,
    doc.file_name
  );

  await loadWorkspaceData();

  toast('🗑️ Document deleted');
}


/* ============================================================
   DOCUMENT PANEL
============================================================ */

function documentPanel(load) {
  const docs =
    loadDocs(load.id);

  const hasRC =
    hasLoadDoc(load.id, 'RC');

  const hasBOL =
    hasLoadDoc(load.id, 'BOL');

  const hasPOD =
    hasLoadDoc(load.id, 'POD');

  return `
    <div class="load-documents">

      <div class="item-row">

        <strong>
          📁 Load Documents
        </strong>

        <div class="meta">
          RC ${hasRC ? '✅' : '❌'}
          ·
          BOL ${hasBOL ? '✅' : '❌'}
          ·
          POD ${hasPOD ? '✅' : '❌'}
        </div>

      </div>


      ${
        load.status === 'Delivered' &&
        !hasPOD
          ? `
            <div class="notice">
              🚨
              <b>POD MISSING</b>
            </div>
          `
          : ''
      }


      <div
        style="
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:10px;
        "
      >

        ${
          docs.length
            ? docs
                .map(
                  d => `
                    <span class="pill">

                      <button
                        class="link-btn open-load-doc"
                        data-doc="${d.id}"
                        type="button"
                      >
                        ${documentIcon(
                          d.document_type
                        )}
                        ${esc(
                          d.document_type
                        )}
                        —
                        ${esc(
                          d.file_name
                        )}
                      </button>

                      ${
                        ['admin', 'dispatcher'].includes(
                          myMembership?.role
                        )
                          ? `
                            <button
                              class="link-btn delete-load-doc"
                              data-doc="${d.id}"
                              type="button"
                            >
                              ✕
                            </button>
                          `
                          : ''
                      }

                    </span>
                  `
                )
                .join('')
            : `
              <span class="muted">
                No documents uploaded.
              </span>
            `
        }

      </div>


      ${
        ['admin', 'dispatcher'].includes(
          myMembership?.role
        )
          ? `
            <div
              style="
                display:grid;
                grid-template-columns:
                  150px 1fr auto;
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
                  <option value="RC">📄 RC</option>
                  <option value="BOL">📋 BOL</option>
                  <option value="POD">✅ POD</option>
                  <option value="Lumper">💵 Lumper</option>
                  <option value="Other">📎 Other</option>
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
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          openLoadDocument(
            button.dataset.doc
          )
      );
    });

  document
    .querySelectorAll(
      '.delete-load-doc'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          deleteLoadDocument(
            button.dataset.doc
          )
      );
    });

  document
    .querySelectorAll(
      '.extra-doc-upload'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        async () => {
          const loadId =
            button.dataset.load;

          const type =
            document.querySelector(
              `.extra-doc-type[data-load="${loadId}"]`
            );

          const input =
            document.querySelector(
              `.extra-doc-file[data-load="${loadId}"]`
            );

          const file =
            input?.files?.[0];

          if (!file) {
            toast(
              '⚠️ Choose a document first'
            );
            return;
          }

          button.disabled = true;
          button.textContent =
            '⏳ Uploading…';

          const ok =
            await uploadLoadDocument(
              loadId,
              file,
              type?.value || 'Other'
            );

          button.disabled = false;
          button.textContent =
            '⬆ Upload';

          if (ok) {
            await loadWorkspaceData();
          }
        }
      );
    });
}


/* ============================================================
   LOAD MATH
============================================================ */

function rpm(load) {
  const miles =
    Number(
      load.loaded_miles || 0
    );

  return miles
    ? (
        Number(
          load.rate || 0
        ) / miles
      ).toFixed(2)
    : '0.00';
}


function allIn(load) {
  const miles =
    Number(
      load.loaded_miles || 0
    ) +
    Number(
      load.deadhead_miles || 0
    );

  return miles
    ? (
        Number(
          load.rate || 0
        ) / miles
      ).toFixed(2)
    : '0.00';
}


/* ============================================================
   LOAD TABLE
============================================================ */

function loadTable(
  list,
  actions = true
) {
  return `
    <table class="data-table">

      <thead>
        <tr>
          <th>Carrier</th>
          <th>Truck / Driver</th>
          <th>Lane</th>
          <th>Broker</th>
          <th>Rate</th>
          <th>RPM</th>
          <th>All-in</th>
          <th>Dispatcher</th>
          <th>Documents</th>
          <th>Status</th>

          ${
            actions
              ? '<th>Actions</th>'
              : ''
          }
        </tr>
      </thead>


      <tbody>

        ${
          list.length
            ? list
                .map(load => {
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

                  return `
                    <tr>

                      <td>
                        🏢
                        <b>
                          ${esc(
                            carrierName(
                              load.trucks?.carrier_id
                            )
                          )}
                        </b>
                      </td>


                      <td>
                        🚚
                        <b>
                          ${esc(
                            load.trucks?.truck_no ||
                            '—'
                          )}
                        </b>

                        <div class="meta">
                          👤
                          ${esc(
                            load.trucks?.driver_name ||
                            '—'
                          )}
                        </div>
                      </td>


                      <td>
                        <b>
                          ${esc(load.origin)}
                        </b>

                        <div class="meta">
                          →
                          ${esc(
                            load.destination
                          )}
                        </div>
                      </td>


                      <td>
                        ${esc(load.broker)}

                        <div class="meta">
                          ${esc(
                            load.source || ''
                          )}
                        </div>
                      </td>


                      <td>
                        ${money(load.rate)}
                      </td>


                      <td>
                        $${rpm(load)}
                      </td>


                      <td>
                        $${allIn(load)}
                      </td>


                      <td>
                        ${esc(
                          memberName(
                            load.assigned_to
                          )
                        )}
                      </td>


                      <td>
                        <div class="meta">
                          📄 RC
                          ${hasRC ? '✅' : '❌'}
                        </div>

                        <div class="meta">
                          📋 BOL
                          ${hasBOL ? '✅' : '❌'}
                        </div>

                        <div class="meta">
                          ✅ POD
                          ${hasPOD ? '✅' : '❌'}
                        </div>
                      </td>


                      <td>
                        ${statusBadge(
                          load.status
                        )}
                      </td>


                      ${
                        actions
                          ? `
                            <td>

                              <select
                                class="load-status"
                                data-id="${load.id}"
                              >
                                <option>Booked</option>
                                <option>At Pickup</option>
                                <option>In Transit</option>
                                <option>At Delivery</option>
                                <option>Delivered</option>
                                <option>Cancelled</option>
                              </select>


                              ${
                                ['admin', 'dispatcher'].includes(
                                  myMembership?.role
                                )
                                  ? `
                                    <button
                                      class="small-btn edit-load-btn"
                                      data-id="${load.id}"
                                      type="button"
                                      style="
                                        margin-top:8px;
                                        width:100%;
                                      "
                                    >
                                      ✏️ Edit Load
                                    </button>
                                  `
                                  : ''
                              }

                            </td>
                          `
                          : ''
                      }

                    </tr>


                    ${
                      actions
                        ? `
                          <tr>
                            <td colspan="11">
                              ${documentPanel(
                                load
                              )}
                            </td>
                          </tr>
                        `
                        : ''
                    }
                  `;
                })
                .join('')
            : `
              <tr>
                <td colspan="11">
                  No loads recorded.
                </td>
              </tr>
            `
        }

      </tbody>

    </table>
  `;
}


/* ============================================================
   RENDER LOADS
============================================================ */

function renderLoads() {
  $('loadsTable').innerHTML =
    loadTable(
      filteredLoads(),
      true
    );

  document
    .querySelectorAll(
      '.edit-load-btn'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        () =>
          beginLoadEdit(
            button.dataset.id
          )
      );
    });


  document
    .querySelectorAll(
      '.load-status'
    )
    .forEach(select => {
      const load =
        loads.find(
          l =>
            String(l.id) ===
            String(
              select.dataset.id
            )
        );

      if (!load) return;

      select.value =
        load.status;

      select.disabled =
        !['admin', 'dispatcher'].includes(
          myMembership?.role
        );

      select.addEventListener(
        'change',
        async () => {
          const oldStatus =
            load.status;

          const newStatus =
            select.value;

          const { error } =
            await sb
              .from('loads')
              .update({
                status: newStatus,
                updated_at:
                  new Date().toISOString()
              })
              .eq('id', load.id);

          if (error) {
            toast(
              '❌ ' +
              error.message
            );

            select.value =
              oldStatus;

            return;
          }

          await logAction(
            'Updated load status',
            'load',
            load.id,
            `${oldStatus} → ${newStatus}`
          );

          await loadWorkspaceData();

          if (
            newStatus === 'Delivered' &&
            !hasLoadDoc(
              load.id,
              'POD'
            )
          ) {
            toast(
              '🚨 Load delivered — POD is still missing'
            );
          }
        }
      );
    });

  bindLoadDocumentButtons();
}


/* ============================================================
   ISSUES
============================================================ */

function renderIssues() {
  $('issuesList').innerHTML =
    filteredIssues()
      .map(
        i => `
          <article
            class="item issue-card ${
              i.priority === 'Critical'
                ? 'critical'
                : i.priority === 'Low'
                ? 'low'
                : ''
            }"
          >

            <div class="item-row">

              <div>
                <b>
                  ${esc(i.title)}
                </b>

                <div class="meta">
                  🏢
                  ${esc(
                    carrierName(
                      i.trucks?.carrier_id
                    )
                  )}
                  ·
                  🚚
                  ${esc(
                    i.trucks?.truck_no ||
                    'None'
                  )}
                  ·
                  ${esc(i.issue_type)}
                </div>
              </div>

              ${statusBadge(
                i.solved
                  ? 'Resolved'
                  : i.priority
              )}

            </div>


            <p>
              ${esc(i.details)}
            </p>


            ${
              i.next_action
                ? `
                  <div class="notice">
                    ➡️
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
                type="button"
              >
                ${
                  i.solved
                    ? '↩ Reopen'
                    : '✅ Resolve'
                }
              </button>

            </div>

          </article>
        `
      )
      .join('') ||
    `
      <div class="card muted">
        No issues.
      </div>
    `;


  document
    .querySelectorAll(
      '.issue-toggle'
    )
    .forEach(button => {
      button.addEventListener(
        'click',
        async () => {
          const issue =
            issues.find(
              i =>
                String(i.id) ===
                String(
                  button.dataset.id
                )
            );

          if (!issue) return;

          const solved =
            !issue.solved;

          const { error } =
            await sb
              .from('issues')
              .update({
                solved,
                resolved_at:
                  solved
                    ? new Date().toISOString()
                    : null,
                updated_at:
                  new Date().toISOString()
              })
              .eq('id', issue.id);

          if (error) {
            toast(
              '❌ ' +
              error.message
            );
            return;
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
    });
}


/* ============================================================
   TASK RENDERING
============================================================ */

function taskHtml(
  task,
  compact = false
) {
  return `
    <div class="item item-row">

      <label
        style="
          display:flex;
          align-items:center;
          gap:10px;
          margin:0;
          flex:1;
        "
      >

        <input
          class="task-check"
          data-id="${task.id}"
          type="checkbox"
          style="width:auto"
          ${
            task.done
              ? 'checked'
              : ''
          }
        >

        <span>

          <b
            ${
              task.done
                ? 'style="text-decoration:line-through;opacity:.6"'
                : ''
            }
          >
            ${esc(task.title)}
          </b>

          ${
            compact
              ? ''
              : `
                <div class="meta">
                  ${esc(
                    task.category ||
                    'Task'
                  )}
                  ·
                  ${esc(
                    task.priority ||
                    'Medium'
                  )}

                  ${
                    task.due_date
                      ? ` · Due ${esc(
                          task.due_date
                        )}`
                      : ''
                  }
                </div>
              `
          }

        </span>

      </label>

    </div>
  `;
}


function bindTaskButtons(root = document) {
  root
    .querySelectorAll(
      '.task-check'
    )
    .forEach(box => {
      box.addEventListener(
        'change',
        async () => {
          const task =
            tasks.find(
              t =>
                String(t.id) ===
                String(
                  box.dataset.id
                )
            );

          if (!task) return;

          const { error } =
            await sb
              .from('tasks')
              .update({
                done:
                  box.checked
              })
              .eq('id', task.id);

          if (error) {
            toast(
              '❌ ' +
              error.message
            );
            return;
          }

          await logAction(
            box.checked
              ? 'Completed task'
              : 'Reopened task',
            'task',
            task.id,
            task.title
          );

          await loadWorkspaceData();
        }
      );
    });
}


function renderTasks() {
  const mine =
    tasks.filter(
      t =>
        t.user_id === user.id
    );

  $('tasksList').innerHTML =
    mine
      .map(
        t =>
          taskHtml(t)
      )
      .join('') ||
    `
      <div class="card muted">
        No tasks.
      </div>
    `;

  bindTaskButtons(
    $('tasksList')
  );
}


/* ============================================================
   CASES
============================================================ */

function renderCases() {
  const search =
    $('caseSearch')?.value
      ?.toLowerCase() || '';

  const scope =
    $('caseScope')?.value ||
    'all';

  const visible =
    cases.filter(c => {
      if (
        scope === 'company' &&
        c.visibility !== 'company'
      ) {
        return false;
      }

      if (
        scope === 'personal' &&
        (
          c.visibility !== 'personal' ||
          c.user_id !== user.id
        )
      ) {
        return false;
      }

      const text =
        `${c.problem} ${c.solution} ${c.lesson} ${c.tags} ${c.category}`
          .toLowerCase();

      return text.includes(search);
    });

  $('casesList').innerHTML =
    visible
      .map(
        c => `
          <article
            class="item case-card ${esc(
              c.visibility
            )}"
          >

            <h3>
              ${esc(c.problem)}
            </h3>

            <div class="meta">
              ${esc(
                c.category || 'General'
              )}
              ·
              ${esc(c.visibility)}
            </div>

            <p>
              <b>Solution:</b>
              ${esc(c.solution)}
            </p>

            ${
              c.lesson
                ? `
                  <p>
                    <b>Prevention:</b>
                    ${esc(c.lesson)}
                  </p>
                `
                : ''
            }

            ${
              c.tags
                ? `
                  <div class="meta">
                    🏷 ${esc(c.tags)}
                  </div>
                `
                : ''
            }

          </article>
        `
      )
      .join('') ||
    `
      <div class="card muted">
        No matching cases.
      </div>
    `;
}


/* ============================================================
   LEARNING
============================================================ */

function renderLearning() {
  const mine =
    learning.filter(
      l =>
        l.user_id === user.id
    );

  $('learningList').innerHTML =
    mine
      .map(
        l => `
          <article class="item">

            <h3>
              🎓 ${esc(l.topic)}
            </h3>

            ${
              l.source
                ? `
                  <div class="meta">
                    Source:
                    ${esc(l.source)}
                  </div>
                `
                : ''
            }

            <p>
              ${esc(l.note)}
            </p>

            ${
              l.question
                ? `
                  <div class="notice">
                    ❓
                    ${esc(l.question)}
                  </div>
                `
                : ''
            }

          </article>
        `
      )
      .join('') ||
    `
      <div class="card muted">
        No learning notes.
      </div>
    `;
}


/* ============================================================
   TEAM
============================================================ */

function renderTeam() {
  $('teamList').innerHTML =
    activeMembers()
      .map(
        m => `
          <article class="card member-card">

            <div class="top">

              <div>

                <h3>
                  ${esc(
                    m.profiles?.display_name ||
                    'Member'
                  )}
                </h3>

                <div class="meta">
                  ${roleLabel(m.role)}
                </div>

              </div>

              ${
                isOnline(m)
                  ? `
                    <span class="badge good">
                      🟢 Online
                    </span>
                  `
                  : `
                    <span class="badge">
                      Offline
                    </span>
                  `
              }

            </div>


            <div class="metric-row">

              <div class="metric">
                <small>XP</small>
                <strong>
                  ${Number(
                    m.profiles?.xp || 0
                  )}
                </strong>
              </div>

              <div class="metric">
                <small>Shift</small>
                <strong>
                  ${
                    m.profiles
                      ?.shift_active
                      ? '🟢 Working'
                      : 'Off'
                  }
                </strong>
              </div>

            </div>


            <div class="meta">
              Last seen:
              ${relativeTime(
                m.profiles?.last_seen
              )}
            </div>

          </article>
        `
      )
      .join('') ||
    `
      <div class="card muted">
        No team members.
      </div>
    `;
}


/* ============================================================
   ACTIVITY
============================================================ */

function renderActivity() {
  $('activityList').innerHTML =
    activity
      .map(
        a => `
          <div class="item activity-row">

            <div class="activity-icon">
              📜
            </div>

            <div>
              <b>
                ${esc(a.action)}
              </b>

              <div class="meta">
                ${esc(
                  a.details || ''
                )}
              </div>
            </div>

            <div class="meta">
              ${fmt(a.created_at)}
            </div>

          </div>
        `
      )
      .join('') ||
    `
      <div class="card muted">
        No activity.
      </div>
    `;
}


/* ============================================================
   ADMIN CENTER
============================================================ */

function renderAdmin() {
  if (
    myMembership?.role !== 'admin'
  ) {
    return;
  }

  const active =
    activeMembers();

  const totalGross =
    loads.reduce(
      (sum, l) =>
        sum +
        Number(l.rate || 0),
      0
    );

  const delivered =
    loads.filter(
      l =>
        l.status === 'Delivered'
    ).length;

  const critical =
    issues.filter(
      i =>
        !i.solved &&
        i.priority === 'Critical'
    ).length;

  $('adminMembers').textContent =
    active.length;

  $('adminOnline').textContent =
    active.filter(isOnline).length;

  $('adminWorking').textContent =
    active.filter(
      m =>
        m.profiles?.shift_active
    ).length;

  $('adminGross').textContent =
    money(totalGross);

  $('adminDelivered').textContent =
    delivered;

  $('adminCritical').textContent =
    critical;


  $('adminLiveTeam').innerHTML =
    active
      .map(
        m => `
          <article class="card member-card">

            <div class="top">

              <div>
                <h3>
                  ${esc(
                    m.profiles?.display_name ||
                    'Member'
                  )}
                </h3>

                <div class="meta">
                  ${roleLabel(m.role)}
                </div>
              </div>

              ${
                isOnline(m)
                  ? `
                    <span class="badge good">
                      🟢 Online
                    </span>
                  `
                  : `
                    <span class="badge">
                      Offline
                    </span>
                  `
              }

            </div>

            <div class="meta">
              Shift:
              ${
                m.profiles?.shift_active
                  ? '🟢 Working'
                  : 'Off'
              }
            </div>

            <div class="meta">
              Last seen:
              ${relativeTime(
                m.profiles?.last_seen
              )}
            </div>

          </article>
        `
      )
      .join('');


  const scoreboardRows =
    active
      .map(m => {
        const uid =
          m.user_id;

        const memberLoads =
          loads.filter(
            l =>
              l.assigned_to === uid
          );

        const gross =
          memberLoads.reduce(
            (sum, l) =>
              sum +
              Number(l.rate || 0),
            0
          );

        const miles =
          memberLoads.reduce(
            (sum, l) =>
              sum +
              Number(
                l.loaded_miles || 0
              ),
            0
          );

        const memberIssues =
          issues.filter(
            i =>
              i.assigned_to === uid &&
              !i.solved
          );

        const memberTasks =
          tasks.filter(
            t =>
              t.user_id === uid
          );

        return `
          <tr>

            <td>
              ${esc(
                m.profiles?.display_name ||
                'Member'
              )}
            </td>

            <td>
              ${memberLoads.length}
            </td>

            <td>
              ${money(gross)}
            </td>

            <td>
              ${
                miles
                  ? '$' +
                    (
                      gross / miles
                    ).toFixed(2)
                  : '$0.00'
              }
            </td>

            <td>
              ${memberIssues.length}
            </td>

            <td>
              ${
                memberTasks.filter(
                  t => t.done
                ).length
              }
              /
              ${memberTasks.length}
            </td>

            <td>
              ${Number(
                m.profiles?.xp || 0
              )}
            </td>

          </tr>
        `;
      })
      .join('');


  $('adminScoreboard').innerHTML = `
    <table class="data-table">

      <thead>
        <tr>
          <th>Dispatcher</th>
          <th>Assigned Loads</th>
          <th>Gross</th>
          <th>RPM</th>
          <th>Open Issues</th>
          <th>Tasks</th>
          <th>XP</th>
        </tr>
      </thead>

      <tbody>
        ${scoreboardRows}
      </tbody>

    </table>
  `;


  if ($('adminActivity')) {
    $('adminActivity').innerHTML =
      activity
        .slice(0, 20)
        .map(
          a => `
            <div class="item">

              <b>
                ${esc(a.action)}
              </b>

              <div class="meta">
                ${esc(
                  a.details || ''
                )}
                ·
                ${fmt(a.created_at)}
              </div>

            </div>
          `
        )
        .join('');
  }


  let carrierArea =
    $('adminCarrierPerformance');

  if (!carrierArea) {
    carrierArea =
      document.createElement('div');

    carrierArea.id =
      'adminCarrierPerformance';

    $('adminScoreboard')?.after(
      carrierArea
    );
  }

  carrierArea.innerHTML = `
    <div class="card">

      <div class="card-head">
        <div>
          <p class="eyebrow">
            🏢 CARRIER PERFORMANCE
          </p>

          <h2>
            Performance by client company
          </h2>
        </div>
      </div>

      <div class="table-wrap">

        <table class="data-table">

          <thead>
            <tr>
              <th>Carrier</th>
              <th>Trucks</th>
              <th>Loads</th>
              <th>Delivered</th>
              <th>Gross</th>
              <th>RPM</th>
            </tr>
          </thead>

          <tbody>

            ${
              carriers
                .map(c => {
                  const cTrucks =
                    carrierTrucks(c.id);

                  const cLoads =
                    carrierLoads(c.id);

                  const gross =
                    cLoads.reduce(
                      (sum, l) =>
                        sum +
                        Number(
                          l.rate || 0
                        ),
                      0
                    );

                  const miles =
                    cLoads.reduce(
                      (sum, l) =>
                        sum +
                        Number(
                          l.loaded_miles ||
                          0
                        ),
                      0
                    );

                  return `
                    <tr>
                      <td>
                        ${esc(
                          c.company_name
                        )}
                      </td>

                      <td>
                        ${cTrucks.length}
                      </td>

                      <td>
                        ${cLoads.length}
                      </td>

                      <td>
                        ${
                          cLoads.filter(
                            l =>
                              l.status ===
                              'Delivered'
                          ).length
                        }
                      </td>

                      <td>
                        ${money(gross)}
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
                    </tr>
                  `;
                })
                .join('') ||
              `
                <tr>
                  <td colspan="6">
                    No carriers yet.
                  </td>
                </tr>
              `
            }

          </tbody>

        </table>

      </div>

    </div>
  `;
}


/* ============================================================
   START APPLICATION
============================================================ */

init();
