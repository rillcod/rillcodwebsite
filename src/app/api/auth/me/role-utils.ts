export function getSafeAutoProfileRole(roleFromMeta: unknown): 'student' | 'parent' | 'teacher' {
  if (roleFromMeta === 'student' || roleFromMeta === 'parent' || roleFromMeta === 'teacher') {
    return roleFromMeta;
  }
  return 'student';
}
