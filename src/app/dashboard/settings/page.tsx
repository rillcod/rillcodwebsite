'use client';

import { useState } from 'react';
import { 
  UserIcon,
  BellIcon,
  ShieldCheckIcon,
  CogIcon,
  EyeIcon,
  EyeSlashIcon,
  CameraIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
  KeyIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  GlobeAltIcon,
  ClipboardDocumentListIcon
} from '@heroicons/react/24/outline';
import { Input, Button, Checkbox, Select, Textarea } from '@/components/ui/Form';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const [profileData, setProfileData] = useState({
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@rillcodacademy.com',
    phone: '+234 811 660 0091',
    role: 'Teacher',
    school: 'Lagos State Model College',
    bio: 'Passionate educator with 5+ years of experience in technology education.',
    avatar: '/api/placeholder/150/150'
  });

  const [notificationSettings, setNotificationSettings] = useState({
    emailNotifications: true,
    pushNotifications: true,
    smsNotifications: false,
    weeklyReports: true,
    assignmentReminders: true,
    courseUpdates: true,
    systemAlerts: false
  });

  const [securitySettings, setSecuritySettings] = useState({
    twoFactorAuth: false,
    loginAlerts: true,
    sessionTimeout: 30,
    passwordExpiry: 90
  });

  const [preferences, setPreferences] = useState({
    language: 'English',
    timezone: 'Africa/Lagos',
    dateFormat: 'DD/MM/YYYY',
    theme: 'system',
    compactMode: false,
    autoSave: true
  });

  const [evaluationReportSettings, setEvaluationReportSettings] = useState({
    enableAttendanceEvaluation: true,
    enableParticipationEvaluation: true,
    enableProjectCompletionEvaluation: true,
    reportFrequency: 'Termly',
    includeChartsInReports: true,
    includeInstructorComments: true,
    autoSendReportsToParents: false,
    autoSendReportsToSchoolPartners: false,
    gradingScaleA: '90-100',
    gradingScaleB: '80-89',
    gradingScaleC: '70-79',
    gradingScaleD: '60-69',
    gradingScaleF: 'Below 60',
  });

  const tabs = [
    { id: 'profile', name: 'Profile', icon: UserIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'security', name: 'Security', icon: ShieldCheckIcon },
    { id: 'preferences', name: 'Preferences', icon: CogIcon },
    { id: 'evaluationReports', name: 'Evaluation & Reports', icon: ClipboardDocumentListIcon }
  ];

  const handleSaveProfile = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsEditing(false);
    setLoading(false);
  };

  const handleNotificationChange = (key: string, value: boolean) => {
    setNotificationSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSecurityChange = (key: string, value: any) => {
    setSecuritySettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handlePreferenceChange = (key: string, value: any) => {
    setPreferences(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleEvaluationReportChange = (key: string, value: any) => {
    setEvaluationReportSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Profile Information</h3>
          <Button
            onClick={() => setIsEditing(!isEditing)}
            variant="secondary"
            size="sm"
            leftIcon={<PencilIcon className="h-4 w-4" />}
          >
            {isEditing ? 'Cancel' : 'Edit Profile'}
          </Button>
        </div>

        <div className="flex items-start space-x-6">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
              <img
                src={profileData.avatar}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            {isEditing && (
              <button className="absolute bottom-0 right-0 p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors">
                <CameraIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="First Name"
                value={profileData.firstName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                disabled={!isEditing}
              />
              <Input
                label="Last Name"
                value={profileData.lastName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                disabled={!isEditing}
              />
            </div>

            <Input
              label="Email"
              type="email"
              value={profileData.email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData(prev => ({ ...prev, email: e.target.value }))}
              disabled={!isEditing}
              leftIcon={<EnvelopeIcon className="h-4 w-4" />}
            />

            <Input
              label="Phone Number"
              value={profileData.phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
              disabled={!isEditing}
              leftIcon={<DevicePhoneMobileIcon className="h-4 w-4" />}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Role"
                value={profileData.role}
                disabled
              />
              <Input
                label="School"
                value={profileData.school}
                disabled
              />
            </div>

            <Textarea
              label="Bio"
              value={profileData.bio}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setProfileData(prev => ({ ...prev, bio: e.target.value }))}
              disabled={!isEditing}
              rows={3}
            />

            {isEditing && (
              <div className="flex items-center space-x-3 pt-4">
                <Button
                  onClick={handleSaveProfile}
                  loading={loading}
                  leftIcon={<CheckIcon className="h-4 w-4" />}
                >
                  Save Changes
                </Button>
                <Button
                  onClick={() => setIsEditing(false)}
                  variant="secondary"
                  leftIcon={<XMarkIcon className="h-4 w-4" />}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const renderNotificationsTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Notification Preferences</h3>
        
        <div className="space-y-6">
          <div>
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Communication Channels</h4>
            <div className="space-y-3">
              <Checkbox
                label="Email Notifications"
                checked={notificationSettings.emailNotifications}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNotificationChange('emailNotifications', e.target.checked)}
              />
              <Checkbox
                label="Push Notifications"
                checked={notificationSettings.pushNotifications}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNotificationChange('pushNotifications', e.target.checked)}
              />
              <Checkbox
                label="SMS Notifications"
                checked={notificationSettings.smsNotifications}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNotificationChange('smsNotifications', e.target.checked)}
              />
            </div>
          </div>

          <div>
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Notification Types</h4>
            <div className="space-y-3">
              <Checkbox
                label="Weekly Progress Reports"
                checked={notificationSettings.weeklyReports}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNotificationChange('weeklyReports', e.target.checked)}
              />
              <Checkbox
                label="Assignment Reminders"
                checked={notificationSettings.assignmentReminders}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNotificationChange('assignmentReminders', e.target.checked)}
              />
              <Checkbox
                label="Course Updates"
                checked={notificationSettings.courseUpdates}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNotificationChange('courseUpdates', e.target.checked)}
              />
              <Checkbox
                label="System Alerts"
                checked={notificationSettings.systemAlerts}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNotificationChange('systemAlerts', e.target.checked)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Security Settings</h3>
        
        <div className="space-y-6">
          <div>
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Authentication</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Two-Factor Authentication</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Add an extra layer of security to your account</p>
                </div>
                <Checkbox
                  checked={securitySettings.twoFactorAuth}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSecurityChange('twoFactorAuth', e.target.checked)}
                />
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-600 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">Login Alerts</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Get notified of new login attempts</p>
                </div>
                <Checkbox
                  checked={securitySettings.loginAlerts}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSecurityChange('loginAlerts', e.target.checked)}
                />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Session Management</h4>
            <div className="space-y-4">
              <Select
                label="Session Timeout (minutes)"
                value={String(securitySettings.sessionTimeout)}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleSecurityChange('sessionTimeout', parseInt(e.target.value))}
                options={[
                  { value: '15', label: '15 minutes' },
                  { value: '30', label: '30 minutes' },
                  { value: '60', label: '1 hour' },
                  { value: '120', label: '2 hours' }
                ]}
              />

              <Select
                label="Password Expiry (days)"
                value={String(securitySettings.passwordExpiry)}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleSecurityChange('passwordExpiry', parseInt(e.target.value))}
                options={[
                  { value: '30', label: '30 days' },
                  { value: '60', label: '60 days' },
                  { value: '90', label: '90 days' },
                  { value: '180', label: '180 days' }
                ]}
              />
            </div>
          </div>

          <div>
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Password</h4>
            <div className="space-y-4">
              <Input
                label="Current Password"
                type={showPassword ? 'text' : 'password'}
                leftIcon={<KeyIcon className="h-4 w-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeSlashIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                }
              />
              <Input
                label="New Password"
                type={showPassword ? 'text' : 'password'}
                leftIcon={<KeyIcon className="h-4 w-4" />}
              />
              <Input
                label="Confirm New Password"
                type={showPassword ? 'text' : 'password'}
                leftIcon={<KeyIcon className="h-4 w-4" />}
              />
              <Button variant="primary">
                Update Password
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPreferencesTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Application Preferences</h3>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Language"
              value={preferences.language}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handlePreferenceChange('language', e.target.value)}
              options={[
                { value: 'English', label: 'English' },
                { value: 'French', label: 'French' },
                { value: 'Spanish', label: 'Spanish' },
                { value: 'Arabic', label: 'Arabic' }
              ]}
            />

            <Select
              label="Timezone"
              value={preferences.timezone}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handlePreferenceChange('timezone', e.target.value)}
              options={[
                { value: 'Africa/Lagos', label: 'Africa/Lagos (GMT+1)' },
                { value: 'UTC', label: 'UTC (GMT+0)' },
                { value: 'America/New_York', label: 'America/New_York (GMT-5)' },
                { value: 'Europe/London', label: 'Europe/London (GMT+0)' }
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Date Format"
              value={preferences.dateFormat}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handlePreferenceChange('dateFormat', e.target.value)}
              options={[
                { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
                { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
                { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' }
              ]}
            />

            <Select
              label="Theme"
              value={preferences.theme}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handlePreferenceChange('theme', e.target.value)}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'System' }
              ]}
            />
          </div>

          <div className="space-y-3">
            <Checkbox
              label="Compact Mode"
              checked={preferences.compactMode}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePreferenceChange('compactMode', e.target.checked)}
            />
            <Checkbox
              label="Auto-save Changes"
              checked={preferences.autoSave}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handlePreferenceChange('autoSave', e.target.checked)}
            />
          </div>
        </div>
      </div>
    </div>
  );

  const renderEvaluationReportsTab = () => (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">Evaluation & Report Settings</h3>
        
        <div className="space-y-6">
          <div>
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Evaluation Criteria</h4>
            <div className="space-y-3">
              <Checkbox
                label="Enable Attendance Evaluation"
                checked={evaluationReportSettings.enableAttendanceEvaluation}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('enableAttendanceEvaluation', e.target.checked)}
              />
              <Checkbox
                label="Enable Participation Evaluation"
                checked={evaluationReportSettings.enableParticipationEvaluation}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('enableParticipationEvaluation', e.target.checked)}
              />
              <Checkbox
                label="Enable Project Completion Evaluation"
                checked={evaluationReportSettings.enableProjectCompletionEvaluation}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('enableProjectCompletionEvaluation', e.target.checked)}
              />
            </div>
          </div>

          <div>
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Report Generation</h4>
            <div className="space-y-4">
              <Select
                label="Report Frequency"
                value={evaluationReportSettings.reportFrequency}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleEvaluationReportChange('reportFrequency', e.target.value)}
                options={[
                  { value: 'Weekly', label: 'Weekly' },
                  { value: 'Monthly', label: 'Monthly' },
                  { value: 'Termly', label: 'Termly' },
                  { value: 'Annually', label: 'Annually' }
                ]}
              />
              <Checkbox
                label="Include Charts in Reports"
                checked={evaluationReportSettings.includeChartsInReports}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('includeChartsInReports', e.target.checked)}
              />
              <Checkbox
                label="Include Instructor Comments"
                checked={evaluationReportSettings.includeInstructorComments}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('includeInstructorComments', e.target.checked)}
              />
              <Checkbox
                label="Auto-send Reports to Parents"
                checked={evaluationReportSettings.autoSendReportsToParents}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('autoSendReportsToParents', e.target.checked)}
              />
              <Checkbox
                label="Auto-send Reports to School Partners"
                checked={evaluationReportSettings.autoSendReportsToSchoolPartners}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('autoSendReportsToSchoolPartners', e.target.checked)}
              />
            </div>
          </div>

          <div>
            <h4 className="text-md font-medium text-gray-900 dark:text-white mb-4">Grading Scale</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Grade A"
                value={evaluationReportSettings.gradingScaleA}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('gradingScaleA', e.target.value)}
              />
              <Input
                label="Grade B"
                value={evaluationReportSettings.gradingScaleB}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('gradingScaleB', e.target.value)}
              />
              <Input
                label="Grade C"
                value={evaluationReportSettings.gradingScaleC}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('gradingScaleC', e.target.value)}
              />
              <Input
                label="Grade D"
                value={evaluationReportSettings.gradingScaleD}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('gradingScaleD', e.target.value)}
              />
              <Input
                label="Grade F"
                value={evaluationReportSettings.gradingScaleF}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleEvaluationReportChange('gradingScaleF', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return renderProfileTab();
      case 'notifications':
        return renderNotificationsTab();
      case 'security':
        return renderSecurityTab();
      case 'preferences':
        return renderPreferencesTab();
      case 'evaluationReports':
        return renderEvaluationReportsTab();
      default:
        return renderProfileTab();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">Manage your account preferences and security</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <tab.icon className="h-5 w-5" />
                  <span>{tab.name}</span>
                </div>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
} 