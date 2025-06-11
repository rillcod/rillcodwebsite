import React, { useState } from 'react';
import { School, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

const SchoolRegistration: React.FC = () => {
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Form data state - streamlined to essential fields only
  const [formData, setFormData] = useState({
    schoolName: '',
    schoolType: '',
    principalName: '',
    schoolAddress: '',
    lga: '',
    state: '',
    schoolPhone: '',
    schoolEmail: '',
    studentCount: '',
    programInterest: '',
    termsAgreement: false
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.termsAgreement) {
      toast.error('Please agree to the terms and conditions');
      return;
    }

    setLoading(true);
    try {
      console.log('Submitting school registration with data:', formData);
      console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
      console.log('Supabase Key exists:', !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
      
      // Insert into schools table with all form fields
      const { data, error } = await supabase
        .from('schools')
        .insert([{
          // School Information
          name: formData.schoolName,
          school_type: formData.schoolType,
          contact_person: formData.principalName,
          address: formData.schoolAddress,
          lga: formData.lga,
          state: formData.state,
          phone: formData.schoolPhone,
          email: formData.schoolEmail,
          student_count: parseInt(formData.studentCount) || 0,
          program_interest: [formData.programInterest]
        }])
        .select();

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
        schoolName: '',
        schoolType: '',
        principalName: '',
        schoolAddress: '',
        lga: '',
        state: '',
        schoolPhone: '',
        schoolEmail: '',
        studentCount: '',
        programInterest: '',
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

  if (formSubmitted) {
    return (
      <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Registration Successful!</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Thank you for your interest in partnering with Rillcod Academy. We'll contact you within 24-48 hours to discuss the next steps.
          </p>
          <button
            onClick={() => setFormSubmitted(false)}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Register Another School
          </button>
        </div>
      </div>
    );
  }

  return (
    <div id="school-registration" className="max-w-2xl mx-auto bg-white dark:bg-gray-900 rounded-xl shadow-lg p-8">
      <div className="text-center mb-8">
        <School className="w-12 h-12 text-blue-500 mx-auto mb-4" />
        <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">School Partnership Registration</h2>
        <p className="text-gray-600 dark:text-gray-400">Partner with us to bring technology education to your students!</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* School Information */}
        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">School Information</h3>
        
        <div>
          <label htmlFor="schoolName" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">School Name*</label>
          <input
            type="text"
            id="schoolName"
            name="schoolName"
            value={formData.schoolName}
            onChange={handleInputChange}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Enter school name"
            required
          />
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="schoolType" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">School Type*</label>
            <select
              id="schoolType"
              name="schoolType"
              value={formData.schoolType}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
            >
              <option value="">Select school type</option>
              <option value="Primary">Primary</option>
              <option value="Secondary">Secondary</option>
              <option value="Both">Both Primary and Secondary</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="principalName" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Principal/Head Teacher*</label>
            <input
              type="text"
              id="principalName"
              name="principalName"
              value={formData.principalName}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Enter principal's name"
              required
            />
          </div>
        </div>
        
        <div>
          <label htmlFor="schoolAddress" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">School Address*</label>
          <textarea
            id="schoolAddress"
            name="schoolAddress"
            value={formData.schoolAddress}
            onChange={handleInputChange}
            rows={3}
            className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            placeholder="Enter full school address"
            required
          ></textarea>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="lga" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Local Government Area*</label>
            <input
              type="text"
              id="lga"
              name="lga"
              value={formData.lga}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Enter LGA"
              required
            />
          </div>
          
          <div>
            <label htmlFor="state" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">State*</label>
            <input
              type="text"
              id="state"
              name="state"
              value={formData.state}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Enter state"
              required
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="schoolPhone" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">School Phone*</label>
            <input
              type="tel"
              id="schoolPhone"
              name="schoolPhone"
              value={formData.schoolPhone}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Enter school phone"
              required
            />
          </div>
          
          <div>
            <label htmlFor="schoolEmail" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">School Email*</label>
            <input
              type="email"
              id="schoolEmail"
              name="schoolEmail"
              value={formData.schoolEmail}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Enter school email"
              required
            />
          </div>
        </div>

        {/* Program Information */}
        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4">Program Information</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label htmlFor="studentCount" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Number of Students*</label>
            <input
              type="number"
              id="studentCount"
              name="studentCount"
              value={formData.studentCount}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              placeholder="Approximate number"
              required
            />
          </div>
          
          <div>
            <label htmlFor="programInterest" className="block text-gray-700 dark:text-gray-300 font-medium mb-2">Program of Interest*</label>
            <select
              id="programInterest"
              name="programInterest"
              value={formData.programInterest}
              onChange={handleInputChange}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              required
            >
              <option value="">Select program</option>
              <option value="Coding Fundamentals">Coding Fundamentals</option>
              <option value="Web Development">Web Development</option>
              <option value="Robotics Programming">Robotics Programming</option>
              <option value="Python Programming">Python Programming</option>
              <option value="Scratch Programming">Scratch Programming</option>
              <option value="ICT Fundamentals">ICT Fundamentals</option>
              <option value="Multiple Programs">Multiple Programs</option>
            </select>
          </div>
        </div>

        {/* Terms and Conditions */}
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <input
              type="checkbox"
              id="termsAgreement"
              name="termsAgreement"
              checked={formData.termsAgreement}
              onChange={handleInputChange}
              className="mt-1 w-4 h-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 bg-white dark:bg-gray-800"
              required
            />
            <label htmlFor="termsAgreement" className="text-sm text-gray-600 dark:text-gray-400">
              I agree to the{' '}
              <a href="/terms-of-service" target="_blank" className="text-blue-600 dark:text-blue-400 hover:underline">
                Terms of Service
              </a>{' '}
              and consent to Rillcod Academy contacting me regarding partnership opportunities.
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-center">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center px-8 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                Submitting...
              </>
            ) : (
              <>
                Submit Registration
                <School className="w-4 h-4 ml-2" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SchoolRegistration;