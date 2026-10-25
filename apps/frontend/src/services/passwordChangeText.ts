import { ApiError } from './apiClient.ts';

const policyText: Record<string, string> = {
  'Current password is incorrect': 'رمز عبور فعلی نادرست است.',
  'New password must be different from the current password': 'رمز عبور جدید باید با رمز فعلی متفاوت باشد.',
  'Must contain at least 12 characters': 'رمز عبور باید حداقل ۱۲ نویسه باشد.',
  'Must contain at most 128 characters': 'رمز عبور حداکثر ۱۲۸ نویسه است.',
  'Must contain an uppercase letter': 'رمز عبور باید حرف بزرگ انگلیسی داشته باشد.',
  'Must contain a lowercase letter': 'رمز عبور باید حرف کوچک انگلیسی داشته باشد.',
  'Must contain a number': 'رمز عبور باید عدد داشته باشد.',
  'Must contain a symbol': 'رمز عبور باید نماد داشته باشد.',
  'Must not contain whitespace': 'رمز عبور نباید فاصله داشته باشد.',
  'Password is too common': 'این رمز عبور خیلی رایج است.',
  'Must not contain the email name': 'رمز عبور نباید شامل نام ایمیل باشد.',
  'Must not contain the user name': 'رمز عبور نباید شامل نام کاربر باشد.',
};

export function changePasswordErrorText(error: unknown): string {
  if (error instanceof ApiError && error.issues?.length) {
    return error.issues.map((issue) => (issue.message && policyText[issue.message]) || issue.message).filter(Boolean).join(' ');
  }
  if (error instanceof Error && policyText[error.message]) return policyText[error.message];
  if (error instanceof Error && error.message) return error.message;
  return 'تغییر رمز عبور انجام نشد.';
}
