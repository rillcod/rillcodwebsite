'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { 
  CheckIcon,
  XMarkIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  AcademicCapIcon,
  BookOpenIcon,
  ChartBarIcon,
  UserGroupIcon,
  LightBulbIcon,
  SparklesIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentListIcon,
  PrinterIcon
} from '@heroicons/react/24/outline';
import Chart from '@/components/ui/Chart';

// Mock data for a single student's progress report
const mockStudentReport = {
  studentInfo: {
    name: 'Angelo Osasere Eguavoen',
    sectionClass: 'BASIC 2',
    school: 'Franej Montessori School',
    course: 'Scratch 3.0 Programming',
    currentModule: 'Sprites and Motion',
    instructor: 'RillCod Technologies',
    reportDate: 'April 10, 2025',
    duration: 'Termly',
  },
  courseProgress: [
    { title: 'Sprite Creation', description: 'Creating and customizing sprites with various costumes' },
    { title: 'Backdrops', description: 'Using and switching between multiple backdrops' },
    { title: 'Looks Blocks', description: 'Changing sprite appearances and effects' },
    { title: 'Next Module', description: 'Events and Control Structures' }
  ],
  performanceAssessment: {
    theoryTest: { score: 85, grade: 'A' },
    practicalTest: { score: 100, grade: 'A' },
    attendance: { score: 83, grade: 'B' },
    participation: { score: 'Very Good', grade: 'A' },
    projectCompletion: { score: 'Completed all', grade: 'A' },
    homeworkCompletion: { score: 'Completed most', grade: 'B' },
  },
  overallPerformance: 'A',
  instructorEvaluation: {
    strengths: [
      'Exceptional creativity in Scratch sprite design and storytelling',
    ],
    areasForGrowth: [
      'Needs to work on optimizing Scratch scripts for performance',
      'Focus on using variables and lists more effectively to track game states and player information',
    ],
    comment: 'Angelo Osasere Eguavoen has made good progress with Scratch programming. They show particular strength in creating interactive stories and animations. To advance further, they should focus on using variables and lists more effectively to track game states and player information.'
  },
  certificate: {
    text: 'This certifies that Angelo Osasere Eguavoen has successfully completed the Scratch 3.0 Programming course, covering the Sprites and Motion module at Rillcod Technologies.',
    qrCode: '/images/qrcode.png',
    instructorSignature: '/images/signature.png'
  }
};

export default function StudentProgressReportPage({ params }: { params: Promise<{ id: string }> }) {
  const [studentReport, setStudentReport] = useState(mockStudentReport);
  const [id, setId] = useState<string>('');

  // Handle async params
  useEffect(() => {
    const getParams = async () => {
      const resolvedParams = await params;
      setId(resolvedParams.id);
      // In a real application, you would fetch data based on the student ID
      // fetchStudentReport(resolvedParams.id).then(data => setStudentReport(data));
    };
    getParams();
  }, [params]);

  const performanceChartData = [
    { label: 'Theory Test', value: studentReport.performanceAssessment.theoryTest.score },
    { label: 'Practical Test', value: studentReport.performanceAssessment.practicalTest.score },
    { label: 'Attendance', value: studentReport.performanceAssessment.attendance.score as number },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white p-4 sm:p-6 lg:p-8 print:p-0 print:bg-white">
      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 shadow-lg rounded-lg overflow-hidden print:shadow-none print:rounded-none">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between print:hidden">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Student Progress Report</h1>
          <button 
            onClick={() => window.print()}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PrinterIcon className="h-5 w-5 mr-2" />
            Print Report
          </button>
        </div>

        {/* Report Content */}
        <div className="p-6 sm:p-8 lg:p-10 space-y-8 print:space-y-4">
          {/* Company Header */}
          <div className="text-center mb-8 print:mb-4">
            <Image 
              src="/logo.png" 
              alt="RILLCOD Technologies Logo" 
              width={80} 
              height={80} 
              className="mx-auto mb-2"
            />
            <h2 className="text-2xl font-extrabold text-blue-700 dark:text-blue-400">RILLCOD TECHNOLOGIES</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">Coding Today, Innovating Tomorrow</p>
            <div className="text-xs text-gray-500 dark:text-gray-500 mt-4 flex flex-wrap justify-center items-center gap-x-4 gap-y-1">
              <span>📍 26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City</span>
              <span>📞 08116600091</span>
              <span>📧 rillcod@gmail.com</span>
              <span>🌐 www.rillcod.com</span>
            </div>
          </div>

          <h3 className="text-xl font-bold text-center text-blue-600 dark:text-blue-400 uppercase mb-6 print:mb-3">Student Progress Report</h3>

          {/* Student Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
              <p><span className="font-semibold">Student Name:</span> {studentReport.studentInfo.name}</p>
              <p><span className="font-semibold">Section/Class:</span> {studentReport.studentInfo.sectionClass}</p>
              <p><span className="font-semibold">Current Module:</span> {studentReport.studentInfo.currentModule}</p>
              <p><span className="font-semibold">Instructor:</span> {studentReport.studentInfo.instructor}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-md">
              <p><span className="font-semibold">School:</span> {studentReport.studentInfo.school}</p>
              <p><span className="font-semibold">Course:</span> {studentReport.studentInfo.course}</p>
              <p><span className="font-semibold">Report Date:</span> {studentReport.studentInfo.reportDate}</p>
              <p><span className="font-semibold">Duration:</span> {studentReport.studentInfo.duration}</p>
            </div>
          </div>

          {/* Course Progress */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4 print:p-4 print:space-y-2">
            <h4 className="text-lg font-bold text-blue-600 dark:text-blue-400 mb-2">COURSE PROGRESS</h4>
            <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
              {studentReport.courseProgress.map((item, index) => (
                <li key={index}><span className="font-semibold">{item.title}:</span> {item.description}</li>
              ))}
            </ul>
          </div>

          {/* Performance Assessment */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 print:p-4">
            <h4 className="text-lg font-bold text-blue-600 dark:text-blue-400 mb-4">PERFORMANCE ASSESSMENT</h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-blue-600 dark:bg-blue-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Assessment</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">Grade</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">Theory Test</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.theoryTest.score}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.theoryTest.grade}</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">Practical Test</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.practicalTest.score}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.practicalTest.grade}</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">Attendance</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.attendance.score}%</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.attendance.grade}</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">Participation</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.participation.score}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.participation.grade}</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">Project Completion</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.projectCompletion.score}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.projectCompletion.grade}</td>
                  </tr>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">Homework Completion</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.homeworkCompletion.score}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{studentReport.performanceAssessment.homeworkCompletion.grade}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Overall Performance */}
          <div className="flex items-center justify-between p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 print:py-2">
            <p className="text-lg font-bold text-yellow-800 dark:text-yellow-200">Overall Performance:</p>
            <span className="text-2xl font-extrabold text-yellow-800 dark:text-yellow-200 bg-yellow-200 dark:bg-yellow-700 px-4 py-2 rounded-full">
              {studentReport.overallPerformance}
            </span>
          </div>

          {/* Performance Chart & Instructor's Evaluation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 print:gap-4">
            {/* Performance Chart */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 print:p-4">
              <h4 className="text-lg font-bold text-blue-600 dark:text-blue-400 mb-4">PERFORMANCE CHART</h4>
              <Chart 
                title="Performance Metrics"
                data={performanceChartData}
                type="bar"
                height={200}
                showValues={true}
              />
            </div>

            {/* Instructor's Evaluation */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4 print:p-4 print:space-y-2">
              <h4 className="text-lg font-bold text-pink-600 dark:text-pink-400">INSTRUCTOR'S EVALUATION</h4>
              <div className="space-y-2 text-gray-700 dark:text-gray-300">
                <p className="italic">{studentReport.instructorEvaluation.comment}</p>
                <div>
                  <p className="font-semibold mb-1 flex items-center text-green-700 dark:text-green-300"><CheckIcon className="h-5 w-5 mr-2" /> Key Strengths:</p>
                  <ul className="list-inside space-y-1 pl-4">
                    {studentReport.instructorEvaluation.strengths.map((strength, index) => (
                      <li key={index} className="flex items-center text-sm"><SparklesIcon className="h-4 w-4 mr-2 text-green-500" /> {strength}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-semibold mb-1 flex items-center text-red-700 dark:text-red-300"><XMarkIcon className="h-5 w-5 mr-2" /> Areas for Growth:</p>
                  <ul className="list-inside space-y-1 pl-4">
                    {studentReport.instructorEvaluation.areasForGrowth.map((area, index) => (
                      <li key={index} className="flex items-center text-sm"><LightBulbIcon className="h-4 w-4 mr-2 text-red-500" /> {area}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Certificate of Completion */}
          <div className="border-2 border-orange-400 dark:border-orange-600 rounded-xl p-8 text-center space-y-6 bg-yellow-50 dark:bg-yellow-900/10 print:p-6 print:space-y-4">
            <h4 className="text-xl font-bold text-orange-600 dark:text-orange-400">CERTIFICATE OF COMPLETION</h4>
            <p className="text-lg font-medium text-gray-800 dark:text-gray-200 leading-relaxed print:text-base">
              {studentReport.certificate.text}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 mt-6">
              <div className="flex flex-col items-center">
                <Image 
                  src="/images/signature.png" 
                  alt="Instructor Signature" 
                  width={150} 
                  height={75} 
                  className="border-b pb-2 mb-2 border-gray-400 dark:border-gray-600"
                />
                <p className="text-sm text-gray-700 dark:text-gray-300">Instructor's Signature</p>
              </div>
              <Image 
                src="/images/qrcode.png" 
                alt="QR Code" 
                width={100} 
                height={100} 
                className="rounded-md"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 