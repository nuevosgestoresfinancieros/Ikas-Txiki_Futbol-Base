import asyncio
from types import SimpleNamespace
from selected_family_batch import provision

class Users:
 def __init__(self, rows=()): self.rows=list(rows)
 async def find_one(self, q, *_): return next((r for r in self.rows if all(r.get(k)==v for k,v in q.items())),None)
 async def insert_one(self, row): self.rows.append(dict(row))
class Players:
 async def distinct(self, *_): return ['p1']
class Logs:
 def __init__(self): self.rows=[]
 async def insert_one(self,row): self.rows.append(row)
def family(**x): return {'id':'f1','progenitor1_nombre':'Ana','progenitor1_email':' ANA@EXAMPLE.TEST ','progenitor2_nombre':'Bea','progenitor2_email':'bea@example.test',**x}
def run(families, users=()):
 db=SimpleNamespace(users=Users(users),players=Players(),delivery_logs=Logs(),internal_events=Logs())
 sent=[]
 def dispatch(*args, **kwargs): sent.append((args,kwargs)); return {'status':'sent','id':'d'}
 result=asyncio.run(provision(db,families,{'id':'admin','role':'admin'},'secret',lambda _: 'hash',dispatch,'https://app.test'))
 return result,db,sent
def test_two_parents_create_independent_accounts_and_idempotent_retry():
 result, db, sent=run([family()])
 assert result['summary']=={'accounts_created':2,'invitations_sent':2,'existing_accesses':0,'families_for_review':0}
 assert len(db.users.rows)==len(sent)==2 and {u['family_id'] for u in db.users.rows}=={'f1'}
 again, _, sent_again=run([family()],db.users.rows)
 assert again['summary']['accounts_created']==0 and again['summary']['existing_accesses']==2 and not sent_again
def test_single_duplicate_invalid_and_existing_are_aggregated_without_secrets():
 active={'email_normalized':'used@example.test','account_status':'active','active':True}
 result, db, sent=run([family(progenitor1_email='used@example.test',progenitor2_email='used@example.test'),family(id='f2',progenitor1_email='',progenitor2_email='invalid')],[active])
 assert result['summary']['existing_accesses']==1 and result['summary']['families_for_review']==2 and not sent
 assert 'token' not in str(result) and 'password' not in str(result) and 'https://' not in str(result)


def test_smtp_failure_keeps_both_accounts_and_records_retryable_delivery_logs():
    db = SimpleNamespace(users=Users(), players=Players(), delivery_logs=Logs(), internal_events=Logs())

    def failing_dispatch(*_args, **_kwargs):
        raise OSError("fake SMTP unavailable")

    result = asyncio.run(provision(
        db, [family()], {"id": "admin", "role": "admin"}, "secret",
        lambda _: "hash", failing_dispatch, "https://app.test",
    ))
    assert result["summary"]["accounts_created"] == 2
    assert result["summary"]["invitations_sent"] == 0
    assert len(db.users.rows) == 2 and len(db.delivery_logs.rows) == 2
    for log in db.delivery_logs.rows:
        assert log["status"] == "failed"
        assert {"recipient", "status", "error", "created_at", "sent_at", "message_id", "user_id", "purpose"} <= log.keys()
    assert all(user["account_status"] == "pending_activation" and user["active"] is False for user in db.users.rows)
