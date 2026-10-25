import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ApiError, requiresPasswordChange, userMustChangePassword } from '../src/services/apiClient.ts';
import { changePasswordErrorText } from '../src/services/passwordChangeText.ts';

test('forced password change is detected from the API code and user flag', () => {
  assert.equal(requiresPasswordChange(new ApiError('Password change required', 403, 'PASSWORD_CHANGE_REQUIRED')), true);
  assert.equal(requiresPasswordChange(new ApiError('Insufficient permission', 403)), false);
  assert.equal(userMustChangePassword({ mustChangePassword: true }), true);
  assert.equal(userMustChangePassword({ mustChangePassword: false }), false);
});

test('password change errors are shown in Persian', () => {
  assert.equal(changePasswordErrorText(new ApiError('Current password is incorrect', 401)), 'رمز عبور فعلی نادرست است.');
  assert.equal(changePasswordErrorText(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [
    { message: 'Must contain at least 12 characters' },
    { message: 'Must contain a symbol' },
  ])), 'رمز عبور باید حداقل ۱۲ نویسه باشد. رمز عبور باید نماد داشته باشد.');
});
