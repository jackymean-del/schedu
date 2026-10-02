"""Live API check: every backend feature the app uses, against a REAL server
and a REAL Postgres, through the same HTTP requests the app sends.

The Go unit tests prove each rule in isolation; this proves the routes, the
schema the server creates on boot, and the data surviving a restart.

Run (from the repo root, Docker Desktop running):
    docker compose up -d db
    docker compose build api && docker compose up -d --no-deps api
    python scripts/live-api-check.py

The compose API runs with SKIP_AUTH=true, so every request is the owner
("dev-user"). It creates, uses and deletes its own schedule; absences are
kept per school, so it counts only the rows it made and can be rerun.
"""
import json, urllib.request, urllib.error, subprocess, time

BASE = 'http://localhost:8080'
fails = 0

def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            txt = r.read().decode()
            return r.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        txt = e.read().decode()
        try: return e.code, json.loads(txt)
        except Exception: return e.code, txt

def ok(cond, label, extra=''):
    global fails
    print(('PASS ' if cond else 'FAIL ') + label + (f'  [{extra}]' if extra else ''))
    if not cond: fails += 1

TUE = '2026-10-06'
or_cell = {'subject': 'Physics OR Chemistry', 'teacher': 'Rao', 'room': 'Lab 1',
           'groupAssignments': [{'subject': 'Physics', 'teacher': 'Rao', 'room': 'Lab 1'},
                                {'subject': 'Chemistry', 'teacher': 'Devi', 'room': 'Lab 2'}]}
data = {'sections': [{'name': 'VII-A'}], 'staff': [{'name': 'Rao'}, {'name': 'Devi'}, {'name': 'Anita'}],
        'classTT': {'VII-A': {'TUESDAY': {'p3': or_cell, 'p1': {'subject': 'English', 'teacher': 'Anita'}}}}}

print('-- schedules')
s, tt = call('POST', '/api/v1/timetables', {'name': 'Live API test', 'data': data, 'config': {'workDays': ['MONDAY', 'TUESDAY']}})
ok(s == 201 and tt.get('id'), 'create a schedule', s)
tid = tt['id']
s, got = call('GET', f'/api/v1/timetables/{tid}')
ok(s == 200 and got['data']['classTT']['VII-A']['TUESDAY']['p3']['subject'] == 'Physics OR Chemistry', 'it reads back exactly', s)
s, _ = call('PUT', f'/api/v1/timetables/{tid}', {'name': 'Live API test (renamed)'})
s2, got = call('GET', f'/api/v1/timetables/{tid}')
ok(s == 200 and got['name'] == 'Live API test (renamed)' and 'classTT' in got['data'], 'rename keeps the data (omitted fields untouched)', s)
s, lst = call('GET', '/api/v1/timetables')
ok(s == 200 and any(t['id'] == tid for t in lst['timetables']), 'it is in the list', s)
s, _ = call('GET', '/api/v1/timetables/00000000-0000-0000-0000-000000000000')
ok(s == 404, 'an unknown schedule is 404', s)
s, _ = call('GET', '/api/v1/timetables/not-a-uuid')
ok(s == 404, 'a malformed id is 404, not a 500', s)

print('-- unavailability')
U = f'/api/v1/timetables/{tid}/unavailability'
cases = [
    ({'staffName': 'Devi', 'date': TUE, 'duration': 'full', 'reason': 'sick'}, 200, 'full day'),
    ({'staffName': 'Rao', 'date': TUE, 'duration': 'half', 'part': 'second', 'reason': 'on-duty'}, 200, 'half day'),
    ({'staffName': 'Anita', 'date': TUE, 'duration': 'hours', 'fromMin': 600, 'toMin': 690, 'reason': 'personal'}, 200, 'some hours'),
    ({'staffName': 'Anita', 'date': '2026-10-20', 'endDate': '2026-10-24', 'duration': 'long', 'reason': 'training'}, 200, 'several days'),
    ({'staffName': '', 'date': TUE, 'duration': 'full', 'reason': 'sick'}, 400, 'no name refused'),
    ({'staffName': 'Devi', 'date': '06-10-2026', 'duration': 'full', 'reason': 'sick'}, 400, 'bad date refused'),
    ({'staffName': 'Devi', 'date': TUE, 'duration': 'half', 'reason': 'sick'}, 400, 'half day with no half refused'),
    ({'staffName': 'Devi', 'date': TUE, 'duration': 'hours', 'fromMin': 700, 'toMin': 600, 'reason': 'sick'}, 400, 'backwards hours refused'),
    ({'staffName': 'Devi', 'date': TUE, 'endDate': '2026-10-01', 'duration': 'long', 'reason': 'sick'}, 400, 'end before start refused'),
    ({'staffName': 'Devi', 'date': TUE, 'duration': 'week', 'reason': 'sick'}, 400, 'unknown duration refused'),
    ({'staffName': 'Devi', 'date': TUE, 'duration': 'full', 'reason': ''}, 400, 'no reason refused'),
    ({'staffName': 'Devi', 'date': TUE, 'duration': 'full', 'reason': 'x' * 500}, 400, 'overlong reason refused'),
]
ids = []
for body, want, label in cases:
    s, r = call('POST', U, body)
    ok(s == want, label, f'{s} {r if s != want else ""}')
    if s == 200: ids.append(r['id'])
mine = lambda r: [x for x in (r or {}).get('unavailability', []) if x['id'] in ids]
s, r = call('GET', U + f'?from={TUE}&to={TUE}')
rows = mine(r)
ok(s == 200 and len(rows) == 3, 'the day shows its three absences, not the later one', f'{s} {len(rows)}')
s, r = call('GET', U + '?from=2026-10-22&to=2026-10-22')
ok(s == 200 and len(mine(r)) == 1, 'a long absence shows on a day in its middle', s)
s, r = call('DELETE', f'{U}/{ids[0]}')
ok(s == 200, 'withdraw one', s)
s, r = call('GET', U + f'?from={TUE}&to={TUE}')
ok(s == 200 and len(mine(r)) == 2, 'and it is gone', len(mine(r)))
s, r = call('DELETE', f'{U}/{ids[0]}')
ok(s == 404, 'withdrawing it twice is 404', s)
s, r = call('GET', '/api/v1/timetables/00000000-0000-0000-0000-000000000000/unavailability?from=2026-10-01&to=2026-10-31')
ok(s == 404, 'another school\'s list is 404', s)
print('   sample row:', json.dumps(rows[0])[:200] if rows else None)

print('-- OR choices')
s, r = call('GET', f'/api/v1/timetables/{tid}/or-slots?date={TUE}')
print('   or-slots:', s, json.dumps(r)[:240])
slots = (r or {}).get('slots', []) if s == 200 else []
ok(s == 200 and len(slots) == 1 and slots[0]['section'] == 'VII-A', 'the OR period is offered', s)
D = f'/api/v1/timetables/{tid}/or-decisions'
s, r = call('POST', D, {'section': 'VII-A', 'date': TUE, 'periodId': 'p3', 'subject': 'Chemistry'})
ok(s == 200, 'decide Chemistry', f'{s} {r}')
s, r = call('GET', D + f'?from={TUE}&to={TUE}')
print('   or-decisions:', s, json.dumps(r)[:200])
ok(s == 200 and 'Chemistry' in json.dumps(r), 'the decision reads back', s)
s, r = call('POST', D, {'section': 'VII-A', 'date': TUE, 'periodId': 'p3', 'subject': 'Biology'})
ok(s == 400, 'a subject that is not an option is refused', f'{s} {r}')
s, r = call('POST', D, {'section': 'VII-A', 'date': TUE, 'periodId': 'p1', 'subject': 'English'})
ok(s in (400, 404), 'a period that is not a choice is refused', f'{s} {r}')
s, r = call('POST', D, {'section': 'VII-A', 'date': TUE, 'periodId': 'p3', 'subject': ''})
ok(s == 200, 'clear it', f'{s} {r}')
s, r = call('GET', D + f'?from={TUE}&to={TUE}')
ok(s == 200 and 'Chemistry' not in json.dumps(r), 'and it is cleared', s)

print('-- members')
s, r = call('POST', '/api/v1/members', {'email': 'devi@demoschool.test', 'staffName': 'Devi', 'role': 'teacher'})
ok(s in (200, 201), 'add a teacher member', f'{s} {r}')
s, r = call('GET', '/api/v1/members')
mem = [m for m in (r or {}).get('members', []) if m.get('email') == 'devi@demoschool.test']
ok(s == 200 and len(mem) == 1, 'listed', s)
s, r = call('POST', '/api/v1/members', {'email': 'not-an-email', 'staffName': 'X', 'role': 'teacher'})
ok(s == 400, 'a bad email is refused', s)
s, r = call('POST', '/api/v1/members', {'email': 'x@demoschool.test', 'staffName': 'X', 'role': 'god'})
ok(s == 400, 'an unknown role is refused', s)
if mem:
    s, r = call('DELETE', f"/api/v1/members/{mem[0]['id']}")
    ok(s == 200, 'remove the member', s)

print('-- sharing')
s, r = call('POST', '/api/v1/timetables/share', {'title': 'VII-A', 'payload': {'classTT': data['classTT']}, 'visibility': 'public'})
ok(s in (200, 201) and r.get('token'), 'create a public share', f'{s} {r}')
if s in (200, 201):
    s2, pub = call('GET', f"/api/share/{r['token']}")
    ok(s2 == 200 and 'VII-A' in json.dumps(pub), 'anyone with the link reads it, signed out', s2)
s, r = call('POST', '/api/v1/timetables/share', {'title': 'VII-A', 'payload': {}, 'visibility': 'restricted', 'emails': ['head@demoschool.test']})
ok(s in (200, 201), 'create a restricted share', f'{s} {r}')
if s in (200, 201):
    s2, pub = call('GET', f"/api/share/{r['token']}")
    ok(s2 == 200 and pub.get('restricted') is True and 'payload' not in pub and 'classTT' not in json.dumps(pub),
       'a restricted share says so and hands out no timetable without a code', f'{s2} {str(pub)[:80]}')
s, r = call('GET', '/api/share/does-not-exist')
ok(s == 404, 'an unknown share link is 404', s)

print('-- billing')
s, r = call('GET', '/api/v1/billing/status')
ok(s == 200 and r.get('plan') == 'free', 'free plan without Razorpay keys', r)
s, r = call('POST', '/api/v1/billing/subscribe', {'plan': 'monthly'})
ok(s in (400, 503), 'subscribing without keys fails safely, no fake upgrade', f'{s} {r}')

print('-- survives a restart')
subprocess.run(['docker', 'restart', 'schedu-api-1'], capture_output=True)
for _ in range(30):
    try:
        if call('GET', '/health')[0] == 200: break
    except Exception: pass
    time.sleep(1)
s, r = call('GET', U + f'?from={TUE}&to={TUE}')
ok(s == 200 and len(mine(r)) == 2, 'absences are still there after the server restarts', s)

s, _ = call('DELETE', f'/api/v1/timetables/{tid}')
ok(s in (200, 204), 'delete the schedule', s)
s, _ = call('GET', U + f'?from={TUE}&to={TUE}')
ok(s == 404, 'its absences go with it', s)

print(f'\n{fails} FAILED' if fails else '\nALL LIVE API CHECKS PASSED')
