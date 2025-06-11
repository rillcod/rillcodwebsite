import React, { useState } from 'react';
import { User, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const StudentRegistration: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  
  const [formData, setFormData] = useState({
    fullName: '',
    age: '',
    grade: '',
    currentSchool: '',
    gender: '',
    parentName: '',
    parentPhone: '',
    parentEmail: '',
    courseInterest: '',
    preferredSchedule: '',
    hearAboutUs: '',
    termsAgreement: false
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const nextStep = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.termsAgreement) {
      toast.error('Please agree to the terms and conditions');
      return;
    }

    setLoading(true);
    try {
      console.log('Submitting student registration with data:', formData);
      console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
      console.log('Supabase Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      
      // First, try to check the database schema
      const { data: schemaData, error: schemaError } = await supabase
        .from('students')
        .select('*')
        .limit(0);
      
      console.log('Schema check result:', { schemaData, schemaError });
      
      // Prepare the data with multiple column name options
      const studentData = {
        full_name: formData.fullName,
        age: parseInt(formData.age) || 0,
        grade: formData.grade,
        // Try both column names for school
        school_name: formData.currentSchool,
        current_school: formData.currentSchool,
        gender: formData.gender,
        parent_name: formData.parentName,
        parent_phone: formData.parentPhone,
        parent_email: formData.parentEmail,
        course_interest: formData.courseInterest,
        preferred_schedule: formData.preferredSchedule,
        hear_about_us: formData.hearAboutUs
      };

      console.log('Student data to insert:', studentData);

      // Try the insert with error handling
      let { data, error } = await supabase
        .from('students')
        .insert([studentData])
        .select();

      // If first attempt fails, try with different column names
      if (error && error.message.includes('school_name')) {
        console.log('Retrying with current_school column...');
        const retryData = {
          full_name: formData.fullName,
          age: parseInt(formData.age) || 0,
          grade: formData.grade,
          current_school: formData.currentSchool,
          gender: formData.gender,
          parent_name: formData.parentName,
          parent_phone: formData.parentPhone,
          parent_email: formData.parentEmail,
          course_interest: formData.courseInterest,
          preferred_schedule: formData.preferredSchedule,
          hear_about_us: formData.hearAboutUs
        };
        
        const retryResult = await supabase
          .from('students')
          .insert([retryData])
          .select();
        
        data = retryResult.data;
        error = retryResult.error;
      }

      console.log('Supabase response:', { 
        data: data, 
        error: error,
        errorMessage: error?.message,
        errorDetails: error?.details,
        errorCode: error?.code
      });

      if (error) {
        console.error('Registration error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: JSON.stringify(error, null, 2)
        });
        toast.error(`Registration failed: ${error.message || 'Unknown error'}`);
        return;
      }

      console.log('Registration successful:', data);
      setFormSubmitted(true);
      toast.success('Registration successful! We\'ll contact you soon.');
      
      // Reset form
      setFormData({
        fullName: '',
        age: '',
        grade: '',
        currentSchool: '',
        gender: '',
        parentName: '',
        parentPhone: '',
        parentEmail: '',
        courseInterest: '',
        preferredSchedule: '',
        hearAboutUs: '',
        termsAgreement: false
      });
    } catch (err) {
      console.error('Registration error:', {
        error: err,
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        fullError: JSON.stringify(err, null, 2)
      });
      toast.error(`Registration failed: ${err instanceof Error ? err.message : 'Unknown error occurred'}`);
    } finally {
      setLoading(false);
    }
  };

  const renderFormStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Student Information</h3>
            
            <div>
              <label htmlFor="fullName" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Full Name*</label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Enter student's full name"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="age" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Age*</label>
                <input
                  type="number"
                  id="age"
                  name="age"
                  value={formData.age}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Enter age"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="gender" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Gender*</label>
                <select
                  id="gender"
                  name="gender"
                  value={formData.gender}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  required
                >
                  <option value="">Select gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            
            <div>
              <label htmlFor="grade" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Grade/Class*</label>
              <select
                id="grade"
                name="grade"
                value={formData.grade}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                required
              >
                <option value="">Select grade</option>
                <option value="Primary 1-3">Primary 1-3</option>
                <option value="Primary 4-6">Primary 4-6</option>
                <option value="JSS 1-3">JSS 1-3</option>
                <option value="SSS 1-3">SSS 1-3</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="currentSchool" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Current School*</label>
              <input
                type="text"
                id="currentSchool"
                name="currentSchool"
                value={formData.currentSchool}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Enter current school name"
                required
              />
            </div>
          </div>
        );
      
      case 2:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Parent/Guardian Information</h3>
            
            <div>
              <label htmlFor="parentName" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Parent/Guardian Name*</label>
              <input
                type="text"
                id="parentName"
                name="parentName"
                value={formData.parentName}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                placeholder="Enter parent's full name"
                required
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="parentPhone" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Phone Number*</label>
                <input
                  type="tel"
                  id="parentPhone"
                  name="parentPhone"
                  value={formData.parentPhone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Enter phone number"
                  required
                />
              </div>
              
              <div>
                <label htmlFor="parentEmail" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Email Address*</label>
                <input
                  type="email"
                  id="parentEmail"
                  name="parentEmail"
                  value={formData.parentEmail}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                  placeholder="Enter email address"
                  required
                />
              </div>
            </div>
          </div>
        );
      
      case 3:
        return (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Program & Preferences</h3>
            
            <div>
              <label htmlFor="courseInterest" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Course Interest*</label>
              <select
                id="courseInterest"
                name="courseInterest"
                value={formData.courseInterest}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                required
              >
                <option value="">Select course</option>
                <option value="ICT Fundamentals">ICT Fundamentals</option>
                <option value="Scratch Programming">Scratch Programming</option>
                <option value="HTML/CSS Programming">HTML/CSS Programming</option>
                <option value="Python Programming">Python Programming</option>
                <option value="Web Design">Web Design</option>
                <option value="Robotics Programming">Robotics Programming</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="preferredSchedule" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Preferred Schedule*</label>
              <select
                id="preferredSchedule"
                name="preferredSchedule"
                value={formData.preferredSchedule}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                required
              >
                <option value="">Select schedule</option>
                <option value="Weekday Afternoons">Weekday Afternoons (after school)</option>
                <option value="Weekend Mornings">Weekend Mornings</option>
                <option value="Weekend Afternoons">Weekend Afternoons</option>
                <option value="School Holidays">School Holidays</option>
              </select>
            </div>
            
            <div>
              <label htmlFor="hearAboutUs" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">How did you hear about us?</label>
              <select
                id="hearAboutUs"
                name="hearAboutUs"
                value={formData.hearAboutUs}
                onChange={handleInputChange}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              >
                <option value="">Select option</option>
                <option value="School">From child's school</option>
                <option value="Friend">Friend or family recommendation</option>
                <option value="Social Media">Social media</option>
                <option value="Search">Internet search</option>
                <option value="Event">At an event</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <p className="text-gray-700 dark:text-gray-300 text-sm">
                <strong>Program Fee:</strong> ₦60,000 per learner
              </p>
            </div>
            
            <div className="flex items-start">
              <input
                id="termsAgreement"
                name="termsAgreement"
                type="checkbox"
                checked={formData.termsAgreement}
                onChange={handleInputChange}
                className="h-5 w-5 text-green-600 mt-1 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 rounded focus:ring-green-500"
                required
              />
              <label htmlFor="termsAgreement" className="ml-2 block text-gray-700 dark:text-gray-300 text-sm">
                I agree to the terms and conditions of Rillcod Academy*
              </label>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (formSubmitted) {
    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Registration Successful!</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Thank you for registering with Rillcod Academy. We'll contact you within 24-48 hours to confirm your enrollment and provide further details.
          </p>
          <button
            onClick={() => setFormSubmitted(false)}
            className="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            Register Another Student
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
      <div className="text-center mb-8">
        <User className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">Student Registration</h2>
        <p className="text-gray-600 dark:text-gray-400">Join our technology education programs and start your coding journey!</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center mb-8">
        {[1, 2, 3].map((step) => (
          <div key={step} className="flex items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
              step <= currentStep
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>
              {step < currentStep ? <Check className="w-4 h-4" /> : step}
            </div>
            {step < 3 && (
              <div className={`w-12 h-1 mx-2 ${
                step < currentStep ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}></div>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {renderFormStep()}

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-6">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={prevStep}
              className="flex items-center px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Previous
            </button>
          )}
          
          {currentStep < 3 ? (
            <button
              type="button"
              onClick={nextStep}
              className="flex items-center px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors ml-auto"
            >
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="flex items-center px-8 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                  Submitting...
                </>
              ) : (
                <>
                  Complete Registration
                  <Check className="w-4 h-4 ml-2" />
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default StudentRegistration;