-- Check for the specific failing emails
SELECT id, email, status, "createdAt", "serverId"
FROM inboxes 
WHERE email IN (
  'hera@theclerk.org',
  'mike@theclerk.org',
  'hera@blueshn.org',
  'mike@blueshn.org',
  'hera@blueshoonsolutions.org',
  'mike@blueshoonsolutions.org'
)
ORDER BY email;

-- Also check for any similar patterns
SELECT email, status, "createdAt"
FROM inboxes
WHERE email LIKE '%hera%' OR email LIKE '%mike%'
ORDER BY email;
