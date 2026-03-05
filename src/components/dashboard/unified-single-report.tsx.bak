"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { ReportContent } from "@/components/report-content"
import { PrintPreview } from "@/components/print-preview"
import { IntelligentSuggestionsDropdown } from "@/components/intelligent-suggestions-dropdown"
import { UnifiedReportGenerator } from "@/components/unified-report-generator"
import { usePDFGenerator } from "@/hooks/use-pdf-generator"
import { useSettings } from "@/hooks/use-settings"
import { useSavedReports } from "@/hooks/use-saved-reports"
import { useToast } from "@/hooks/use-toast"
import html2canvas from "html2canvas"
import {
  FileText,
  BarChart3,
  Crown,
  Eye,
  Download,
  Save,
  Wand2,
  Plus,
  Trash2,
  CheckCircle,
  Target,
  MessageSquare,
  GraduationCap,
  Settings,
  Sparkles,
  User,
  BookOpen,
  Printer,
  Check,
  Camera,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
} from "lucide-react"

interface UnifiedSingleReportProps {
  onReportGenerated?: (reportId: string, screenshotUrl: string, additionalData?: any) => void
}

interface FormData {
  studentName: string
  schoolName: string
  studentSection: string
  reportDate: string
  courseName?: string
  duration?: string
  currentModule?: string
  nextModule?: string
  theoryScore: string
  practicalScore: string
  attendance: string
  participation: string
  projectCompletion: string
  homeworkCompletion: string
  progressItems: string[]
  customFields: { [key: string]: string }
  photo?: File
  photoPreview?: string
  reportStatus: 'draft' | 'in-progress' | 'completed'
  lastModified: Date
  aiGeneratedContent?: string
  validationErrors: { [key: string]: string }
  strengths: string
  growth: string
  comments: string
  certificateText: string
  showPaymentDetails: boolean
}

const initialFormData: FormData = {
  studentName: "",
  schoolName: "",
  studentSection: "",
  reportDate: new Date().toISOString().split("T")[0],
  duration: "",
  currentModule: "",
  nextModule: "",
  theoryScore: "",
  practicalScore: "",
  attendance: "",
  participation: "",
  projectCompletion: "",
  homeworkCompletion: "",
  progressItems: [],
  customFields: {},
  reportStatus: 'draft',
  lastModified: new Date(),
  validationErrors: {},
  strengths: "",
  growth: "",
  comments: "",
  certificateText: "",
  showPaymentDetails: false,
}

const participationLevels = [
  { value: "excellent", label: "Excellent", description: "Always engaged and participates actively in discussions and activities" },
  { value: "very-good", label: "Very Good", description: "Frequently participates and shows genuine interest in learning" },
  { value: "good", label: "Good", description: "Participates when prompted and demonstrates understanding" },
  { value: "fair", label: "Fair", description: "Limited participation but follows along with class activities" },
  { value: "needs-improvement", label: "Needs Improvement", description: "Rarely participates or shows engagement" },
]

const completionLevels = [
  { value: "completed", label: "Completed", description: "All tasks finished on time with high-quality work" },
  { value: "mostly-completed", label: "Mostly Completed", description: "Majority of tasks completed to satisfactory standard" },
  { value: "partially-completed", label: "Partially Completed", description: "Some tasks completed, others in progress or pending" },
  { value: "not-completed", label: "Not Completed", description: "Tasks not finished or submitted within deadline" },
]

const availableCourses = [
  { id: "python-fundamentals", name: "Python Programming Fundamentals", icon: "🐍" },
  { id: "web-development", name: "Full-Stack Web Development", icon: "🌐" },
  { id: "robotics-engineering", name: "Robotics Engineering & Programming", icon: "🤖" },
  { id: "scratch", name: "Scratch 3.0 Visual Programming", icon: "🎮" },
  { id: "javascript-essentials", name: "JavaScript Essentials", icon: "⚡" },
  { id: "database-design", name: "Database Design & SQL", icon: "🗄️" },
  { id: "mobile-development", name: "Mobile App Development", icon: "📱" },
  { id: "cybersecurity-basics", name: "Cybersecurity Fundamentals", icon: "🔒" },
]

const courseProgressTemplates = [
  "Variables and Data Types: Understanding fundamental programming concepts",
  "Control Structures: Mastering if-else statements and loops",
  "Functions: Writing reusable code blocks",
  "Data Structures: Working with arrays, lists, and objects",
  "Problem Solving: Developing logical thinking skills",
  "Debugging: Learning to identify and fix errors",
  "Best Practices: Following coding standards and conventions",
  "Project Development: Building complete applications"
]

const participationOptions = [
  "Excellent - Always engaged and participates actively",
  "Very Good - Frequently participates and shows interest", 
  "Good - Participates when prompted",
  "Fair - Limited participation but follows along",
  "Needs Improvement - Rarely participates"
]

// Helper function to determine student performance level
const getStudentLevel = (theoryScore: number, practicalScore: number, attendance: number): string => {
  const avgScore = (theoryScore + practicalScore) / 2
  if (avgScore >= 90 && attendance >= 95) return "Advanced"
  if (avgScore >= 80 && attendance >= 90) return "Proficient" 
  if (avgScore >= 70 && attendance >= 85) return "Developing"
  return "Beginning"
}

export function UnifiedSingleReport(props: UnifiedSingleReportProps) {
  const [formData, setFormData] = useState<FormData>({ ...initialFormData, showPaymentDetails: false })
  const [selectedTier, setSelectedTier] = useState<"minimal" | "standard" | "hd">("standard")
  const [showPreview, setShowPreview] = useState(false)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("basic")
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [validationErrors, setValidationErrors] = useState<{ [key: string]: string }>({})
  const [uploadProgress, setUploadProgress] = useState(0)
  
  // Ensure showPaymentDetails is false by default on mount
  useEffect(() => {
    if (formData.showPaymentDetails === undefined || formData.showPaymentDetails === true) {
      setFormData(prev => ({ ...prev, showPaymentDetails: false }))
    }
  }, [])
  
  // Enhanced AI Generation Features
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [aiGenerationActive, setAiGenerationActive] = useState(false)
  const [currentSubject, setCurrentSubject] = useState("Programming")
  const [studentPerformanceLevel, setStudentPerformanceLevel] = useState("B")
  const [selectedProgressCourse, setSelectedProgressCourse] = useState<string>("")
  const [selectedProgressItems, setSelectedProgressItems] = useState<Set<string>>(new Set())
  const [previewZoom, setPreviewZoom] = useState(100)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  
  const reportRef = useRef<HTMLDivElement>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const { settings } = useSettings()
  const { addReport } = useSavedReports()
  const { toast } = useToast()
  const { generateAndDownloadPDF } = usePDFGenerator()

  // Merge global settings with form overrides so selected course/module show up in the report
  const reportSettings = useMemo(
    () => ({
      ...settings,
      courseName: formData.courseName || settings.courseName,
      currentModule: formData.currentModule || settings.currentModule,
      nextModule: formData.nextModule || settings.nextModule,
      duration: formData.duration || settings.duration,
    }),
    [settings, formData.courseName, formData.currentModule, formData.nextModule, formData.duration],
  )

  // Enhanced auto-save functionality
  useEffect(() => {
    const autoSaveTimer = setTimeout(() => {
      if (formData.studentName || formData.schoolName) {
        handleAutoSave()
      }
    }, 3000)

    return () => clearTimeout(autoSaveTimer)
  }, [formData])

  // Auto-fit preview on open and handle resize
  useEffect(() => {
    const calculateFitZoom = () => {
      if (showPreview && previewContainerRef.current) {
        const containerWidth = previewContainerRef.current.clientWidth - 32 // Account for padding
        const reportWidth = 210 * 3.779527559 // Convert mm to px
        const fitZoom = Math.floor((containerWidth / reportWidth) * 100)
        return Math.max(50, Math.min(100, fitZoom))
      }
      return 100
    }

    if (showPreview) {
      // Initial fit
      const fitZoom = calculateFitZoom()
      setPreviewZoom(fitZoom)

      // Handle window resize
      const handleResize = () => {
        const fitZoom = calculateFitZoom()
        // Only auto-fit if zoom is close to previous fit (within 10%)
        if (Math.abs(previewZoom - fitZoom) < 10) {
          setPreviewZoom(fitZoom)
        }
      }

      window.addEventListener('resize', handleResize)
      return () => window.removeEventListener('resize', handleResize)
    }
  }, [showPreview, previewZoom])

  const handleAutoSave = async () => {
    setIsAutoSaving(true)
    try {
      const autoSaveData = {
        ...formData,
        lastModified: new Date(),
        reportStatus: 'draft' as const
      }
      localStorage.setItem('singleReport_autoSave', JSON.stringify(autoSaveData))
      
      toast({
        title: "Auto-saved",
        description: "Report saved automatically",
        duration: 2000,
      })
    } catch (error) {
      console.error('Auto-save failed:', error)
    } finally {
      setIsAutoSaving(false)
    }
  }

  // Enhanced photo upload functionality
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please select a photo under 2MB",
        variant: "destructive",
      })
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
      return
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (JPG, PNG, GIF, WebP)",
        variant: "destructive",
      })
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
      return
    }

    setUploadProgress(0)
    const reader = new FileReader()
    
    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const progress = (e.loaded / e.total) * 100
        setUploadProgress(progress)
      }
    }

    reader.onerror = (e) => {
      toast({
        title: "Upload failed",
        description: "Failed to read the image file",
        variant: "destructive",
      })
      setUploadProgress(0)
      if (photoInputRef.current) {
        photoInputRef.current.value = ''
      }
    }

    reader.onload = (e) => {
      const result = e.target?.result as string
      if (result) {
        setFormData(prev => ({
          ...prev,
          photo: file,
          photoPreview: result,
          lastModified: new Date()
        }))
        setUploadProgress(100)
        
        toast({
          title: "Photo uploaded successfully",
          description: `${file.name} (${(file.size / 1024).toFixed(1)}KB) uploaded`,
        })

        setTimeout(() => setUploadProgress(0), 2000)
      }
    }

    reader.readAsDataURL(file)
  }

  const removePhoto = () => {
    setFormData(prev => ({
      ...prev,
      photo: undefined,
      photoPreview: undefined,
      lastModified: new Date()
    }))
    if (photoInputRef.current) {
      photoInputRef.current.value = ''
    }
    toast({
      title: "Photo removed",
      description: "Student photo has been removed",
    })
  }

  // Enhanced validation
  const validateForm = (): boolean => {
    const errors: { [key: string]: string } = {}

    // Required fields
    if (!formData.studentName || !formData.studentName.trim()) {
      errors.studentName = "Student name is required"
    }

    if (!formData.schoolName || !formData.schoolName.trim()) {
      errors.schoolName = "School name is required"
    }

    // Optional numeric fields - validate only if provided
    if (formData.theoryScore && formData.theoryScore !== "") {
      const score = Number(formData.theoryScore)
      if (isNaN(score) || score < 0 || score > 100) {
        errors.theoryScore = "Theory score must be between 0 and 100"
      }
    }

    if (formData.practicalScore && formData.practicalScore !== "") {
      const score = Number(formData.practicalScore)
      if (isNaN(score) || score < 0 || score > 100) {
        errors.practicalScore = "Practical score must be between 0 and 100"
      }
    }

    if (formData.attendance && formData.attendance !== "") {
      const score = Number(formData.attendance)
      if (isNaN(score) || score < 0 || score > 100) {
        errors.attendance = "Attendance must be between 0 and 100"
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleInputChange = (field: keyof FormData, value: string | boolean | string[]) => {
    setFormData((prev) => ({ 
      ...prev, 
      [field]: value,
      lastModified: new Date(),
      reportStatus: prev.reportStatus === 'completed' ? 'in-progress' : prev.reportStatus
    }))
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[field]
        return newErrors
      })
    }
  }

  const addProgressItem = () => {
    if (formData.progressItems.length >= 3) {
      toast({
        title: "Maximum Limit Reached",
        description: "You can only add up to 3 progress items",
        variant: "destructive",
      })
      return
    }
    const newItem = "New Topic: Description"
    setFormData((prev) => ({
      ...prev,
      progressItems: [...prev.progressItems, newItem],
    }))
  }

  const updateProgressItem = (index: number, value: string) => {
    setFormData((prev) => ({
      ...prev,
      progressItems: prev.progressItems.map((item, i) => (i === index ? value : item)),
    }))
  }

  const removeProgressItem = (index: number) => {
    if (formData.progressItems.length <= 1) {
      toast({
        title: "Minimum Required",
        description: "At least 1 progress item is required",
        variant: "destructive",
      })
      return
    }
    setFormData((prev) => ({
      ...prev,
      progressItems: prev.progressItems.filter((_, i) => i !== index),
    }))
  }

  // Helper function to determine student level based on scores
  const getStudentLevel = (): "beginner" | "intermediate" | "advanced" => {
    const theory = Number(formData.theoryScore) || 0;
    const practical = Number(formData.practicalScore) || 0;
    const avgScore = isNaN(theory) || isNaN(practical) ? 0 : (theory + practical) / 2;
    if (avgScore >= 85) return "advanced"
    if (avgScore >= 70) return "intermediate"
    return "beginner"
  }

  const generateAIContent = async (type: "strengths" | "growth" | "comments" | "progress") => {
    setIsGenerating(true)
    try {
      // Simulate AI generation with realistic content
      await new Promise((resolve) => setTimeout(resolve, 2000))

      const studentName = formData.studentName || "the student"
      const theoryScore = Number.parseInt(formData.theoryScore) || 0
      const practicalScore = Number.parseInt(formData.practicalScore) || 0
      const attendance = Number.parseInt(formData.attendance) || 0

      let content = ""

      switch (type) {
        case "strengths":
          if (theoryScore >= 80 && practicalScore >= 80) {
            content = `${studentName} demonstrates excellent analytical thinking and problem-solving abilities. Shows strong understanding of programming concepts and applies them effectively in practical exercises.`
          } else if (theoryScore >= 70 || practicalScore >= 70) {
            content = `${studentName} shows good grasp of fundamental concepts and demonstrates steady progress in practical applications. Exhibits strong attention to detail in coding exercises.`
          } else {
            content = `${studentName} shows willingness to learn and asks thoughtful questions. Demonstrates effort in understanding basic programming concepts and follows instructions well.`
          }
          break

        case "growth":
          if (theoryScore < 70) {
            content = `Focus on strengthening theoretical understanding through additional practice problems. Review fundamental concepts and work on applying them in different scenarios.`
          } else if (practicalScore < 70) {
            content = `Increase hands-on coding practice and work on debugging skills. Focus on translating theoretical knowledge into practical programming solutions.`
          } else {
            content = `Continue building on strong foundation by exploring advanced topics and taking on more challenging programming projects. Work on code optimization and best practices.`
          }
          break

        case "comments":
          const avgScore = (theoryScore + practicalScore + attendance) / 3
          if (avgScore >= 85) {
            content = `${studentName} has shown exceptional progress in this module. Their understanding of programming concepts is excellent, and they consistently produce high-quality work. They actively participate in class discussions and help other students when needed.`
          } else if (avgScore >= 70) {
            content = `${studentName} has made good progress in understanding programming fundamentals. They show consistent effort and are developing solid problem-solving skills. With continued practice, they will excel in upcoming modules.`
          } else {
            content = `${studentName} is working hard to grasp programming concepts. While they face some challenges, their determination and willingness to learn are commendable. Additional practice and support will help them improve significantly.`
          }
          break

        case "progress":
          setFormData((prev) => ({
            ...prev,
            progressItems: [...courseProgressTemplates],
          }))
          toast({
            title: "Course Progress Generated",
            description: "AI has generated course progress items based on programming fundamentals.",
          })
          return
      }

      setFormData((prev) => ({ ...prev, [type]: content }))

      toast({
        title: "Content Generated",
        description: `AI has generated ${type} content based on student performance.`,
      })
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: "Failed to generate AI content. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // Auto-detect subject from course name and sync both ways
  useEffect(() => {
    const courseName = formData.courseName?.toLowerCase() || ""
    if (courseName.includes("python")) {
      setCurrentSubject("Python Programming")
    } else if (courseName.includes("web")) {
      setCurrentSubject("Web Development")
    } else if (courseName.includes("robot")) {
      setCurrentSubject("Robotics")
    } else if (courseName.includes("java")) {
      setCurrentSubject("Java Programming")
    } else if (courseName && !currentSubject) {
      setCurrentSubject("Programming")
    }
  }, [formData.courseName])

  // Sync currentSubject back to formData.courseName when manually changed
  useEffect(() => {
    if (currentSubject && currentSubject !== formData.courseName) {
      setFormData(prev => ({ ...prev, courseName: currentSubject }))
    }
  }, [currentSubject])

  // Auto-detect performance level
  useEffect(() => {
    const theoryScore = Number(formData.theoryScore) || 0
    const practicalScore = Number(formData.practicalScore) || 0
    const avgScore = (theoryScore + practicalScore) / 2
    
    if (avgScore >= 85) {
      setStudentPerformanceLevel("A")
    } else if (avgScore >= 70) {
      setStudentPerformanceLevel("B")
    } else if (avgScore >= 60) {
      setStudentPerformanceLevel("C")
    } else {
      setStudentPerformanceLevel("D")
    }
  }, [formData.theoryScore, formData.practicalScore])

  const handleSaveReport = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the highlighted errors before saving.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      // Update form data status
      const updatedFormData = {
        ...formData,
        reportStatus: 'completed' as const,
        lastModified: new Date()
      }
      setFormData(updatedFormData)

      // Generate screenshot
      if (reportRef.current) {
        const canvas = await html2canvas(reportRef.current, {
          scale: 2,
          logging: false,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
        })

        const screenshotUrl = canvas.toDataURL("image/png", 1.0)

        await addReport({
          studentName: formData.studentName,
          tier: selectedTier,
          reportData: formData,
          screenshotUrl,
          additionalData: { settings: reportSettings },
        })

        // Call the callback to notify parent component
        if (onReportGenerated) {
          const reportId = Date.now().toString()
          onReportGenerated(reportId, screenshotUrl, { settings: reportSettings })
        }

        toast({
          title: "Report Saved",
          description: `Report for ${formData.studentName} has been saved successfully.`,
        })
      }
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Failed to save the report. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDownloadPDF = async () => {
    // Find the report element - prioritize the actual .page element
    let reportElement: HTMLElement | null = null
    
    console.log("PDF Download - Looking for report element...")
    console.log("PDF Download - reportRef.current:", reportRef.current)
    
    // First try to find the .page element (the actual report content)
    reportElement = document.querySelector('.page[data-pdf-element="report"]') as HTMLElement ||
                    document.querySelector('.page') as HTMLElement ||
                    reportRef.current?.querySelector('.page') as HTMLElement ||
                    reportRef.current
    
    console.log("PDF Download - Found report element:", reportElement)
    
    // Fallback: try other selectors
    if (!reportElement) {
      reportElement = document.querySelector('[data-pdf-element="report"]') as HTMLElement ||
                      document.querySelector('.report-content') as HTMLElement ||
                      reportRef.current
      console.log("PDF Download - Fallback element:", reportElement)
    }
    
    if (!reportElement) {
      toast({
        title: "PDF Generation Failed",
        description: "Report content not found. Please ensure the preview is visible and try again.",
        variant: "destructive",
      })
      return
    }
    
    // Ensure element is visible
    if (reportElement.offsetWidth === 0 || reportElement.offsetHeight === 0) {
      toast({
        title: "PDF Generation Failed",
        description: "Report content is not visible. Please ensure the preview is displayed.",
        variant: "destructive",
      })
      return
    }

    setIsGenerating(true)
    try {
      const success = await generateAndDownloadPDF(reportElement, {
        tier: selectedTier,
        studentName: formData.studentName || "Student",
        reportData: formData,
        settings: reportSettings,
      })

      if (!success) {
        throw new Error("PDF generation returned false")
      }

      toast({
        title: "PDF Downloaded",
        description: "Report has been downloaded as PDF successfully.",
      })
    } catch (error) {
      console.error("Single report PDF download failed:", error)
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      toast({
        title: "Download Failed",
        description: errorMessage.length > 80 ? `${errorMessage.substring(0, 80)}...` : errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const minimalReportData = useMemo(() => {
    if (selectedTier !== "minimal") return null

    const theoryScore = Number(formData.theoryScore) || 0
    const practicalScore = Number(formData.practicalScore) || 0
    const attendance = Number(formData.attendance) || 0

    return {
      studentName: formData.studentName || "",
      schoolName: formData.schoolName || "",
      studentSection: formData.studentSection || "",
      reportDate: formData.reportDate,
      theoryScore,
      practicalScore,
      attendance,
      participation: formData.participation || "",
      projectCompletion: formData.projectCompletion || "",
      homeworkCompletion: formData.homeworkCompletion || "",
      progressItems: formData.progressItems || [],
      strengths: formData.strengths || "",
      growth: formData.growth || "",
      comments: formData.comments || "",
      certificateText: formData.certificateText || "",
      showPaymentDetails: formData.showPaymentDetails,
      tier: selectedTier,
      settings: reportSettings,
      generatedAt: new Date().toISOString(),
    }
  }, [formData, selectedTier, reportSettings])

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case "minimal":
        return <FileText className="h-4 w-4" />
      case "standard":
        return <BarChart3 className="h-4 w-4" />
      case "hd":
        return <Crown className="h-4 w-4 text-yellow-600" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const getTierColor = (tier: string) => {
    switch (tier) {
      case "minimal":
        return "bg-gray-100 text-gray-800 border-gray-300"
      case "standard":
        return "bg-blue-100 text-blue-800 border-blue-300"
      case "hd":
        return "bg-yellow-100 text-yellow-800 border-yellow-300"
      default:
        return "bg-blue-100 text-blue-800 border-blue-300"
    }
  }

  return (
    <div className="space-y-6">
      {/* Enhanced Header */}
      <Card className="border-blue-200 shadow-lg bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardHeader className="pb-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-md">
                <User className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-blue-900">Single Student Report Generator</CardTitle>
                <p className="text-blue-600 mt-1">Create comprehensive progress reports with ease</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {isAutoSaving && (
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300 animate-pulse">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-1"></div>
                  Auto-saving...
                </Badge>
              )}
              
              {formData.studentName && (
                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
                  <User className="h-3 w-3 mr-1" />
                  {formData.studentName}
                </Badge>
              )}

              <Badge variant="outline" className={`text-xs ${getTierColor(selectedTier)}`}>
                {getTierIcon(selectedTier)}
                <span className="ml-1 capitalize">{selectedTier}</span>
              </Badge>
            </div>
          </div>

          {/* Quick Progress Indicator */}
          {formData.studentName && (
            <div className="mt-4 p-4 bg-white rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Report Completion</span>
                <span className="text-sm text-gray-600">
                  {Math.round(((formData.studentName ? 1 : 0) + 
                              (formData.schoolName ? 1 : 0) + 
                              (formData.theoryScore ? 1 : 0) + 
                              (formData.practicalScore ? 1 : 0) + 
                              (formData.attendance ? 1 : 0)) / 5 * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{
                    width: `${((formData.studentName ? 1 : 0) + 
                              (formData.schoolName ? 1 : 0) + 
                              (formData.theoryScore ? 1 : 0) + 
                              (formData.practicalScore ? 1 : 0) + 
                              (formData.attendance ? 1 : 0)) / 5 * 100}%`
                  }}
                ></div>
              </div>
            </div>
          )}
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Enhanced Form Section */}
        <Card className="border-blue-100 shadow-md bg-gradient-to-br from-white to-blue-50">{" "}
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Settings className="h-5 w-5" />
              Report Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              {/* Enhanced Tab Navigation */}
              <div className="bg-white border border-blue-200 rounded-xl p-1 sm:p-2">
                <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 bg-transparent gap-1 sm:gap-2 h-auto">
                  <TabsTrigger 
                    value="basic" 
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-blue-700 data-[state=active]:text-white data-[state=active]:shadow-md flex flex-col items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 rounded-lg transition-all duration-200 hover:bg-blue-50 text-[10px] sm:text-xs md:text-sm"
                  >
                    <User className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                    <span className="font-medium text-center leading-tight">Basic Info</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="scores" 
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-600 data-[state=active]:to-green-700 data-[state=active]:text-white data-[state=active]:shadow-md flex flex-col items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 rounded-lg transition-all duration-200 hover:bg-green-50 text-[10px] sm:text-xs md:text-sm"
                  >
                    <Target className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                    <span className="font-medium text-center leading-tight">Scores</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="progress"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-600 data-[state=active]:to-purple-700 data-[state=active]:text-white data-[state=active]:shadow-md flex flex-col items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 rounded-lg transition-all duration-200 hover:bg-purple-50 text-[10px] sm:text-xs md:text-sm"
                  >
                    <BookOpen className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                    <span className="font-medium text-center leading-tight">Progress</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="evaluation"
                    className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-600 data-[state=active]:to-orange-700 data-[state=active]:text-white data-[state=active]:shadow-md flex flex-col items-center justify-center gap-1 sm:gap-2 py-2 sm:py-3 px-2 sm:px-4 rounded-lg transition-all duration-200 hover:bg-orange-50 text-[10px] sm:text-xs md:text-sm"
                  >
                    <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 shrink-0" />
                    <span className="font-medium text-center leading-tight">Evaluation</span>
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Enhanced Basic Info Tab */}
              <TabsContent value="basic" className="space-y-6">
                {/* Course Selection - Enhanced */}
                <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <BookOpen className="h-4 w-4 text-white" />
                      </div>
                      Course Information
                    </CardTitle>
                    <p className="text-sm text-gray-600">Select the course and provide basic details</p>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="space-y-3">
                      <Label htmlFor="currentSubject" className="text-sm font-semibold text-gray-700">Course/Subject *</Label>
                      <Select 
                        value={currentSubject} 
                        onValueChange={(value) => {
                          setCurrentSubject(value)
                          setFormData(prev => ({ ...prev, courseName: value }))
                        }}
                      >
                        <SelectTrigger className="border-blue-200 focus:border-blue-400">
                          <SelectValue placeholder="Select course or subject" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableCourses.map((course) => (
                            <SelectItem key={course.id} value={course.name}>
                              <div className="flex items-center gap-2">
                                <span>{course.icon}</span>
                                <span>{course.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {currentSubject && (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <span>✓</span>
                          <span>Active Subject: {currentSubject}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Enhanced Student Information */}
                <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                      Student Information
                    </CardTitle>
                    <p className="text-sm text-gray-600">Enter the student's personal and academic details</p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <Label htmlFor="studentName" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          Student Name *
                          <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="studentName"
                          value={formData.studentName}
                          onChange={(e) => handleInputChange("studentName", e.target.value)}
                          placeholder="Enter student full name"
                          className={`border-blue-200 focus:border-blue-400 focus:ring-blue-400 transition-colors ${validationErrors.studentName ? 'border-red-400 focus:border-red-400' : ''}`}
                        />
                        {validationErrors.studentName && (
                          <div className="flex items-center gap-2 text-sm text-red-600">
                            <div className="w-4 h-4 bg-red-100 rounded-full flex items-center justify-center">
                              <span className="text-xs">!</span>
                            </div>
                            {validationErrors.studentName}
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="schoolName" className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                          School/Institution *
                          <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="schoolName"
                          value={formData.schoolName}
                          onChange={(e) => handleInputChange("schoolName", e.target.value)}
                          placeholder="Enter school or institution name"
                          className={`border-blue-200 focus:border-blue-400 focus:ring-blue-400 transition-colors ${validationErrors.schoolName ? 'border-red-400 focus:border-red-400' : ''}`}
                        />
                        {validationErrors.schoolName && (
                          <div className="flex items-center gap-2 text-sm text-red-600">
                            <div className="w-4 h-4 bg-red-100 rounded-full flex items-center justify-center">
                              <span className="text-xs">!</span>
                            </div>
                            {validationErrors.schoolName}
                          </div>
                        )}
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="studentSection" className="text-sm font-semibold text-gray-700">Section/Grade Level</Label>
                        <Input
                          id="studentSection"
                          value={formData.studentSection}
                          onChange={(e) => handleInputChange("studentSection", e.target.value)}
                          placeholder="e.g., Grade 10A, Section B, Year 12"
                          className="border-blue-200 focus:border-blue-400 focus:ring-blue-400 transition-colors"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="reportDate" className="text-sm font-semibold text-gray-700">Assessment Date</Label>
                        <Input
                          id="reportDate"
                          type="date"
                          value={formData.reportDate}
                          onChange={(e) => handleInputChange("reportDate", e.target.value)}
                          className="border-blue-200 focus:border-blue-400 focus:ring-blue-400 transition-colors"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="duration" className="text-sm font-semibold text-gray-700">Course Duration</Label>
                        <Input
                          id="duration"
                          value={formData.duration || ""}
                          onChange={(e) => handleInputChange("duration", e.target.value)}
                          placeholder="e.g., 12 weeks, 3 months, 6 months"
                          className="border-blue-200 focus:border-blue-400 focus:ring-blue-400 transition-colors"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="currentModule" className="text-sm font-semibold text-gray-700">Current Module</Label>
                        <Input
                          id="currentModule"
                          value={formData.currentModule || ""}
                          onChange={(e) => handleInputChange("currentModule", e.target.value)}
                          className="border-blue-200 focus:border-blue-400 focus:ring-blue-400 transition-colors"
                        />
                      </div>
                      <div className="space-y-3">
                        <Label htmlFor="nextModule" className="text-sm font-semibold text-gray-700">Next Module</Label>
                        <Input
                          id="nextModule"
                          value={formData.nextModule || ""}
                          onChange={(e) => handleInputChange("nextModule", e.target.value)}
                          className="border-blue-200 focus:border-blue-400 focus:ring-blue-400 transition-colors"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                
                {/* Enhanced Photo Upload Section */}
                <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-white">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Camera className="h-4 w-4 text-white" />
                      </div>
                      Student Photo
                    </CardTitle>
                    <p className="text-sm text-gray-600">Upload a professional photo for the report (optional)</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-5">
                      {formData.photoPreview ? (
                        <div className="flex flex-col items-center space-y-4">
                          <div className="relative group">
                            <img
                              src={formData.photoPreview}
                              alt="Student photo preview"
                              className="w-40 h-40 rounded-xl object-cover border-4 border-blue-200 shadow-lg transition-transform group-hover:scale-105"
                            />
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={removePhoto}
                              className="absolute -top-3 -right-3 h-8 w-8 p-0 rounded-full shadow-lg hover:shadow-xl transition-all"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all rounded-xl"></div>
                          </div>
                          <div className="flex flex-col items-center space-y-3">
                            <div className="flex items-center space-x-3">
                              <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-300">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Photo uploaded successfully
                              </Badge>
                              {formData.photo && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-300">
                                  {(formData.photo.size / 1024).toFixed(1)}KB
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => photoInputRef.current?.click()}
                              className="border-blue-300 text-blue-700 hover:bg-blue-50 shadow-sm"
                            >
                              <Camera className="h-4 w-4 mr-2" />
                              Change Photo
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-blue-300 rounded-xl p-8 bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-all duration-300">
                          <div className="text-center">
                            <div className="flex items-center justify-center mb-4">
                              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                                <Camera className="h-8 w-8 text-blue-500" />
                              </div>
                            </div>
                            <input
                              ref={photoInputRef}
                              type="file"
                              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                              onChange={handlePhotoUpload}
                              className="hidden"
                              id="photo-upload"
                            />
                            <label
                              htmlFor="photo-upload"
                              className="cursor-pointer inline-flex items-center px-6 py-3 border border-blue-300 rounded-lg shadow-sm text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 hover:shadow-md transition-all duration-200"
                            >
                              <Plus className="h-4 w-4 mr-2" />
                              Upload Student Photo
                            </label>
                            <div className="mt-3 space-y-1">
                              <p className="text-xs text-blue-600 font-medium">
                                Supports JPG, PNG, GIF, WebP
                              </p>
                              <p className="text-xs text-gray-500">
                                Maximum file size: 2MB
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {uploadProgress > 0 && uploadProgress < 100 && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-blue-600 font-medium">Uploading...</span>
                            <span className="text-sm text-blue-600">{Math.round(uploadProgress)}%</span>
                          </div>
                          <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Report Status Section */}
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-3">
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        formData.reportStatus === 'completed' ? 'bg-green-500' : 
                        formData.reportStatus === 'in-progress' ? 'bg-yellow-500' : 'bg-gray-400'
                      }`}></div>
                      <span className="text-sm font-medium text-gray-700">
                        Status: <span className="capitalize">{formData.reportStatus}</span>
                      </span>
                    </div>
                    {isAutoSaving && (
                      <div className="flex items-center space-x-1 text-blue-600">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-pulse"></div>
                        <span className="text-xs">Auto-saving...</span>
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-500">
                    Last modified: {formData.lastModified.toLocaleTimeString()}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="scores" className="space-y-6">
                {/* Academic Performance */}
                <Card className="border-blue-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-5 w-5 text-blue-600" />
                      Academic Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Score Inputs */}
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="theoryScore" className="text-sm font-medium">Theory Assessment Score</Label>
                        <Input
                          id="theoryScore"
                          type="number"
                          min="0"
                          max="100"
                          value={formData.theoryScore || ""}
                          onChange={(e) => handleInputChange("theoryScore", e.target.value)}
                          placeholder="0-100"
                          className={`border-blue-200 focus:border-blue-400 ${validationErrors.theoryScore ? 'border-red-400' : ''}`}
                        />
                        <div className="text-xs text-gray-500">Written tests, quizzes, conceptual understanding</div>
                        {validationErrors.theoryScore && (
                          <span className="text-sm text-red-600">{validationErrors.theoryScore}</span>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="practicalScore" className="text-sm font-medium">Practical Assessment Score</Label>
                        <Input
                          id="practicalScore"
                          type="number"
                          min="0"
                          max="100"
                          value={formData.practicalScore || ""}
                          onChange={(e) => handleInputChange("practicalScore", e.target.value)}
                          placeholder="0-100"
                          className={`border-blue-200 focus:border-blue-400 ${validationErrors.practicalScore ? 'border-red-400' : ''}`}
                        />
                        <div className="text-xs text-gray-500">Hands-on projects, coding assignments, labs</div>
                        {validationErrors.practicalScore && (
                          <span className="text-sm text-red-600">{validationErrors.practicalScore}</span>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="attendance" className="text-sm font-medium">Attendance Rate</Label>
                        <Input
                          id="attendance"
                          type="number"
                          min="0"
                          max="100"
                          value={formData.attendance || ""}
                          onChange={(e) => handleInputChange("attendance", e.target.value)}
                          placeholder="0-100"
                          className="border-blue-200 focus:border-blue-400"
                        />
                        <div className="text-xs text-gray-500">Class attendance percentage</div>
                      </div>
                    </div>

                    {/* Performance Summary */}
                    {formData.theoryScore && formData.practicalScore && (
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="space-y-3">
                          <h4 className="font-medium text-gray-900">Overall Performance</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-gray-600">Student Level:</p>
                              <p className="font-medium text-blue-600">{getStudentLevel()}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-2xl font-bold text-blue-600">
                                {(() => {
                                  const theory = Number(formData.theoryScore) || 0;
                                  const practical = Number(formData.practicalScore) || 0;
                                  const average = (theory + practical) / 2;
                                  return isNaN(average) ? 0 : Math.round(average);
                                })()}%
                              </p>
                              <p className="text-sm text-gray-500">Average Score</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Behavioral Assessment */}
                <Card className="border-blue-200">
                  <CardHeader className="pb-3 px-3 sm:px-6">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                      Behavioral Assessment
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 sm:space-y-5 px-3 sm:px-6 pb-4 sm:pb-6">
                    {/* Responsive Grid Layout */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                      {/* Class Participation */}
                      <div className="space-y-2.5 sm:space-y-3">
                        <Label className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 mb-1">
                          <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
                          <span className="break-words">Class Participation</span>
                        </Label>
                        <Select
                          value={formData.participation}
                          onValueChange={(value) => handleInputChange("participation", value)}
                        >
                          <SelectTrigger className="h-10 sm:h-11 border-blue-200 focus:border-blue-400 text-sm w-full touch-manipulation">
                            <SelectValue placeholder="Select level" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px] overflow-y-auto">
                            {participationLevels.map((level) => (
                              <SelectItem 
                                key={level.value} 
                                value={level.label}
                                className="py-2.5 sm:py-3 touch-manipulation"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium text-sm">{level.label}</span>
                                  <span className="text-xs text-gray-500 leading-tight">{level.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {formData.participation && (
                          <div className="text-xs text-green-600 flex items-start gap-1.5 mt-1.5 pt-1.5 border-t border-green-100">
                            <Check className="h-3 w-3 flex-shrink-0 mt-0.5" />
                            <span className="break-words leading-relaxed">Selected: {formData.participation}</span>
                          </div>
                        )}
                      </div>

                      {/* Project Completion */}
                      <div className="space-y-2.5 sm:space-y-3">
                        <Label className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 mb-1">
                          <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
                          <span className="break-words">Project Completion</span>
                        </Label>
                        <Select
                          value={formData.projectCompletion}
                          onValueChange={(value) => handleInputChange("projectCompletion", value)}
                        >
                          <SelectTrigger className="h-10 sm:h-11 border-blue-200 focus:border-blue-400 text-sm w-full touch-manipulation">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px] overflow-y-auto">
                            {completionLevels.map((level) => (
                              <SelectItem 
                                key={level.value} 
                                value={level.label}
                                className="py-2.5 sm:py-3 touch-manipulation"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium text-sm">{level.label}</span>
                                  <span className="text-xs text-gray-500 leading-tight">{level.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {formData.projectCompletion && (
                          <div className="text-xs text-green-600 flex items-start gap-1.5 mt-1.5 pt-1.5 border-t border-green-100">
                            <Check className="h-3 w-3 flex-shrink-0 mt-0.5" />
                            <span className="break-words leading-relaxed">Selected: {formData.projectCompletion}</span>
                          </div>
                        )}
                      </div>

                      {/* Homework Completion */}
                      <div className="space-y-2.5 sm:space-y-3 md:col-span-2 lg:col-span-1">
                        <Label className="text-xs sm:text-sm font-medium flex items-center gap-1.5 sm:gap-2 mb-1">
                          <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-500 flex-shrink-0" />
                          <span className="break-words">Homework Completion</span>
                        </Label>
                        <Select
                          value={formData.homeworkCompletion}
                          onValueChange={(value) => handleInputChange("homeworkCompletion", value)}
                        >
                          <SelectTrigger className="h-10 sm:h-11 border-blue-200 focus:border-blue-400 text-sm w-full touch-manipulation">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent className="max-h-[300px] overflow-y-auto">
                            {completionLevels.map((level) => (
                              <SelectItem 
                                key={level.value} 
                                value={level.label}
                                className="py-2.5 sm:py-3 touch-manipulation"
                              >
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-medium text-sm">{level.label}</span>
                                  <span className="text-xs text-gray-500 leading-tight">{level.description}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {formData.homeworkCompletion && (
                          <div className="text-xs text-green-600 flex items-start gap-1.5 mt-1.5 pt-1.5 border-t border-green-100">
                            <Check className="h-3 w-3 flex-shrink-0 mt-0.5" />
                            <span className="break-words leading-relaxed">Selected: {formData.homeworkCompletion}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Summary - Responsive */}
                    {(formData.participation || formData.projectCompletion || formData.homeworkCompletion) && (
                      <div className="mt-3 sm:mt-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="font-medium text-blue-900 mb-2 sm:mb-3 flex items-center gap-1.5 sm:gap-2 text-sm sm:text-base">
                          <BarChart3 className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                          Assessment Summary
                        </h4>
                        <div className="space-y-2 sm:space-y-2.5">
                          {formData.participation && (
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm text-gray-600">Participation:</span>
                              <Badge variant="outline" className="bg-white text-xs px-2 py-0.5 sm:px-2.5 sm:py-1 whitespace-nowrap">
                                {formData.participation}
                              </Badge>
                            </div>
                          )}
                          {formData.projectCompletion && (
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm text-gray-600">Projects:</span>
                              <Badge variant="outline" className="bg-white text-xs px-2 py-0.5 sm:px-2.5 sm:py-1 whitespace-nowrap">
                                {formData.projectCompletion}
                              </Badge>
                            </div>
                          )}
                          {formData.homeworkCompletion && (
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm text-gray-600">Homework:</span>
                              <Badge variant="outline" className="bg-white text-xs px-2 py-0.5 sm:px-2.5 sm:py-1 whitespace-nowrap">
                                {formData.homeworkCompletion}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="progress" className="space-y-4">
                <div className="space-y-4">
                  <div className="flex flex-col space-y-3">
                    <Label className="text-lg font-semibold text-gray-900">Progress Items</Label>
                    
                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => generateAIContent("progress")}
                        disabled={isGenerating}
                        className="border-blue-200 text-blue-700 hover:bg-blue-50 w-full sm:w-auto"
                      >
                        <Wand2 className="h-4 w-4 mr-2" />
                        AI Generate
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addProgressItem}
                        disabled={formData.progressItems.length >= 3}
                        className="border-green-200 text-green-700 hover:bg-green-50 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Item {formData.progressItems.length >= 3 ? "(Max 3)" : `(${formData.progressItems.length}/3)`}
                      </Button>
                    </div>

                    {/* Course Progress Selection */}
                    <Card className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                      <div className="space-y-4">
                        <h4 className="font-medium text-gray-900 flex items-center gap-2">
                          <BookOpen className="h-4 w-4 text-blue-600" />
                          Select Course Progress Items (Choose up to 3)
                        </h4>
                        
                        {/* Course Selector */}
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold text-gray-700">Select Course</Label>
                          <Select 
                            value={selectedProgressCourse} 
                            onValueChange={(value) => {
                              setSelectedProgressCourse(value)
                              setSelectedProgressItems(new Set())
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select a course to view progress items" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="python">🐍 Python Programming</SelectItem>
                              <SelectItem value="webdev">🌐 Web Development</SelectItem>
                              <SelectItem value="scratch">🎨 Scratch Programming</SelectItem>
                              <SelectItem value="mobile">📱 Mobile Development</SelectItem>
                              <SelectItem value="datascience">📊 Data Science</SelectItem>
                              <SelectItem value="cybersecurity">🔒 Cybersecurity</SelectItem>
                              <SelectItem value="robotics">🤖 Robotics Engineering</SelectItem>
                              <SelectItem value="javascript">⚡ JavaScript Essentials</SelectItem>
                              <SelectItem value="database">🗄️ Database Design & SQL</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Progress Items List */}
                        {selectedProgressCourse && (
                          <div className="space-y-3">
                            <Label className="text-sm font-semibold text-gray-700">
                              Select Progress Items ({selectedProgressItems.size}/3 selected)
                            </Label>
                            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-white space-y-2">
                              {(() => {
                                const courseTemplates: Record<string, string[]> = {
                                  python: [
                                    "Variables & Data Types: Successfully implemented string, integer, boolean, and float variables with proper type handling",
                                    "Control Structures: Mastered if-else statements, elif chains, and nested conditional logic",
                                    "Loops: Demonstrated proficiency with for loops, while loops, and loop control statements",
                                    "Functions: Created reusable functions with parameters, return values, and scope management",
                                    "Data Structures: Worked with lists, dictionaries, tuples, and sets effectively",
                                    "File Handling: Implemented file reading, writing, and data persistence operations",
                                    "Error Handling: Developed try-except blocks and error management strategies",
                                    "Object-Oriented Programming: Created classes, objects, and implemented inheritance",
                                    "Modules & Packages: Utilized built-in and third-party libraries effectively",
                                    "Debugging: Developed systematic approach to identifying and fixing errors",
                                    "Problem Solving: Applied algorithmic thinking to solve complex programming challenges",
                                    "Code Quality: Followed PEP 8 standards and wrote clean, readable code"
                                  ],
                                  webdev: [
                                    "HTML5 Fundamentals: Created semantic web pages with proper structure and accessibility",
                                    "CSS Styling: Applied responsive design principles, flexbox, and grid layouts",
                                    "JavaScript Basics: Implemented interactive features, DOM manipulation, and event handling",
                                    "React Components: Built reusable UI components with props, state, and hooks",
                                    "State Management: Managed application state using React hooks and context API",
                                    "API Integration: Successfully connected frontend to REST APIs and handled async operations",
                                    "Responsive Design: Created mobile-first designs that work across all devices",
                                    "Version Control: Used Git and GitHub for project version control and collaboration",
                                    "Build Tools: Configured and used webpack, Vite, or similar build tools",
                                    "Testing: Wrote unit tests and integration tests for web applications",
                                    "Performance Optimization: Implemented code splitting, lazy loading, and optimization techniques",
                                    "Deployment: Deployed web applications to hosting platforms like Vercel or Netlify"
                                  ],
                                  scratch: [
                                    "Visual Programming: Mastered block-based coding concepts and logic flow",
                                    "Game Development: Created interactive games with sprites, animations, and game mechanics",
                                    "Event Handling: Implemented user input, keyboard controls, and interactive controls",
                                    "Creative Projects: Designed engaging stories, animations, and educational simulations",
                                    "Problem Solving: Demonstrated computational thinking and algorithm design",
                                    "Sprite Management: Created and customized multiple sprites with different behaviors",
                                    "Sound & Music: Integrated sound effects and background music into projects",
                                    "Variables & Lists: Used variables and lists to store and manage data",
                                    "Broadcasting: Implemented message passing between sprites using broadcast blocks",
                                    "Conditional Logic: Applied if-then-else blocks for decision making",
                                    "Loops & Repetition: Used repeat and forever blocks for automation",
                                    "Project Planning: Designed and planned complex multi-sprite projects"
                                  ],
                                  mobile: [
                                    "Mobile UI/UX: Designed responsive interfaces following platform guidelines (iOS/Android)",
                                    "Cross-Platform Dev: Built apps using React Native or Flutter for multiple platforms",
                                    "API Integration: Connected mobile apps to cloud services and databases",
                                    "Device Features: Utilized camera, GPS, accelerometer, and native device capabilities",
                                    "App Store Deploy: Successfully published apps to Google Play and App Store",
                                    "State Management: Implemented state management solutions like Redux or MobX",
                                    "Navigation: Created intuitive navigation patterns with stack, tab, and drawer navigation",
                                    "Data Persistence: Implemented local storage, SQLite, and cloud database integration",
                                    "Push Notifications: Integrated push notification systems for user engagement",
                                    "Authentication: Implemented user login, registration, and security features",
                                    "Performance: Optimized app performance, memory usage, and battery efficiency",
                                    "Testing: Conducted device testing and resolved platform-specific issues"
                                  ],
                                  datascience: [
                                    "Data Analysis: Processed datasets using Pandas and NumPy libraries effectively",
                                    "Data Visualization: Created insightful charts using Matplotlib, Seaborn, and Plotly",
                                    "Machine Learning: Implemented classification and regression models with scikit-learn",
                                    "Statistical Analysis: Applied hypothesis testing and statistical methods",
                                    "Big Data Tools: Worked with SQL databases and data preprocessing techniques",
                                    "Data Cleaning: Handled missing data, outliers, and data quality issues",
                                    "Feature Engineering: Created and selected relevant features for machine learning models",
                                    "Model Evaluation: Assessed model performance using appropriate metrics",
                                    "Data Wrangling: Transformed and reshaped data for analysis",
                                    "Jupyter Notebooks: Created well-documented notebooks for data analysis projects",
                                    "Data Storytelling: Presented findings through clear visualizations and reports",
                                    "Predictive Modeling: Built and deployed predictive models for real-world applications"
                                  ],
                                  cybersecurity: [
                                    "Security Fundamentals: Understanding of cybersecurity principles and best practices",
                                    "Vulnerability Assessment: Conducted systematic security testing and analysis",
                                    "Incident Response: Developed protocols for security breach management",
                                    "Ethical Hacking: Applied penetration testing within legal boundaries",
                                    "Security Tools: Proficient with industry-standard security software and tools",
                                    "Network Security: Implemented firewall rules, VPNs, and network monitoring",
                                    "Cryptography: Understood encryption, hashing, and cryptographic protocols",
                                    "Risk Assessment: Identified and evaluated security risks and threats",
                                    "Security Policies: Developed and implemented organizational security policies",
                                    "Forensics: Conducted digital forensics and evidence collection",
                                    "Compliance: Understood security compliance standards (GDPR, HIPAA, etc.)",
                                    "Security Awareness: Educated users on security best practices and threats"
                                  ],
                                  robotics: [
                                    "Robot Design: Designed and built robot chassis with proper weight distribution",
                                    "Programming Logic: Implemented control algorithms for robot movement and navigation",
                                    "Sensors Integration: Integrated ultrasonic, infrared, and touch sensors",
                                    "Motor Control: Programmed precise motor control for movement and manipulation",
                                    "Obstacle Avoidance: Developed algorithms for detecting and avoiding obstacles",
                                    "Line Following: Implemented line-following algorithms using sensor arrays",
                                    "PID Control: Applied PID control systems for stable robot operation",
                                    "Arduino/Raspberry Pi: Programmed microcontrollers for robot control",
                                    "Mechanical Assembly: Assembled and maintained robot hardware components",
                                    "Problem Solving: Troubleshot and debugged robot behavior issues",
                                    "Competition Prep: Prepared robots for robotics competitions and challenges",
                                    "Documentation: Documented robot design, programming, and testing processes"
                                  ],
                                  javascript: [
                                    "ES6+ Features: Utilized modern JavaScript features like arrow functions, destructuring, and async/await",
                                    "DOM Manipulation: Mastered DOM selection, manipulation, and event handling",
                                    "Asynchronous Programming: Implemented promises, async/await, and handled asynchronous operations",
                                    "Array Methods: Effectively used map, filter, reduce, and other array methods",
                                    "Object-Oriented JS: Created classes, prototypes, and implemented inheritance",
                                    "API Integration: Fetched data from REST APIs and handled JSON responses",
                                    "Local Storage: Implemented browser storage for data persistence",
                                    "Event Handling: Created interactive UIs with event listeners and event delegation",
                                    "Error Handling: Implemented try-catch blocks and error management",
                                    "Code Organization: Structured code with modules and proper separation of concerns",
                                    "Testing: Wrote unit tests using testing frameworks like Jest",
                                    "Performance: Optimized JavaScript code for better performance and load times"
                                  ],
                                  database: [
                                    "SQL Fundamentals: Mastered SELECT, INSERT, UPDATE, DELETE, and JOIN operations",
                                    "Database Design: Created normalized database schemas with proper relationships",
                                    "Query Optimization: Wrote efficient queries and optimized database performance",
                                    "Data Modeling: Designed ER diagrams and database structures",
                                    "Stored Procedures: Created and executed stored procedures and functions",
                                    "Database Administration: Managed user permissions, backups, and database maintenance",
                                    "NoSQL Databases: Worked with MongoDB, Redis, or other NoSQL solutions",
                                    "ORM Tools: Used ORM frameworks like Sequelize or TypeORM",
                                    "Data Migration: Performed database migrations and schema updates",
                                    "Indexing: Created and managed database indexes for performance",
                                    "Transactions: Implemented ACID transactions and handled concurrency",
                                    "Data Security: Implemented data encryption and access control measures"
                                  ]
                                };

                                const items = courseTemplates[selectedProgressCourse] || [];
                                
                                return items.map((item, index) => {
                                  const isSelected = selectedProgressItems.has(item);
                                  const isDisabled = !isSelected && selectedProgressItems.size >= 3;
                                  
                                  return (
                                    <div 
                                      key={index}
                                      className={`flex items-start gap-3 p-2 rounded-lg border transition-colors ${
                                        isSelected 
                                          ? 'bg-blue-50 border-blue-300' 
                                          : isDisabled 
                                            ? 'bg-gray-50 border-gray-200 opacity-50' 
                                            : 'bg-white border-gray-200 hover:bg-gray-50 cursor-pointer'
                                      }`}
                                      onClick={() => {
                                        if (isDisabled) return;
                                        
                                        const newSelected = new Set(selectedProgressItems);
                                        if (isSelected) {
                                          newSelected.delete(item);
                                        } else {
                                          newSelected.add(item);
                                        }
                                        setSelectedProgressItems(newSelected);
                                        
                                        // Update formData immediately
                                        setFormData(prev => ({
                                          ...prev,
                                          progressItems: Array.from(newSelected)
                                        }));
                                      }}
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        disabled={isDisabled}
                                        onCheckedChange={(checked) => {
                                          if (isDisabled && !checked) return;
                                          
                                          const newSelected = new Set(selectedProgressItems);
                                          if (checked) {
                                            if (newSelected.size >= 3) {
                                              toast({
                                                title: "Maximum Limit Reached",
                                                description: "You can only select up to 3 progress items",
                                                variant: "destructive",
                                              });
                                              return;
                                            }
                                            newSelected.add(item);
                                          } else {
                                            newSelected.delete(item);
                                          }
                                          setSelectedProgressItems(newSelected);
                                          
                                          // Update formData
                                          setFormData(prev => ({
                                            ...prev,
                                            progressItems: Array.from(newSelected)
                                          }));
                                        }}
                                      />
                                      <Label 
                                        className={`text-sm flex-1 cursor-pointer ${isDisabled ? 'cursor-not-allowed' : ''}`}
                                      >
                                        {item}
                                      </Label>
                                    </div>
                                  );
                                });
                              })()}
                            </div>
                            
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedProgressItems(new Set())
                                  setFormData(prev => ({
                                    ...prev,
                                    progressItems: []
                                  }));
                                  toast({
                                    title: "Selection Cleared",
                                    description: "All progress items have been cleared",
                                  });
                                }}
                                disabled={selectedProgressItems.size === 0}
                                className="border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Clear Selection
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                  {formData.progressItems.map((item, index) => (
                    <Card key={index} className="border-blue-100 bg-blue-50/30">
                      <CardContent className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-blue-600">
                              Progress Item #{index + 1}
                            </span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeProgressItem(index)}
                              className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <Textarea
                            value={item}
                            onChange={(e) => updateProgressItem(index, e.target.value)}
                            rows={2}
                            className="text-sm border-blue-200 focus:border-blue-400 bg-white"
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {formData.progressItems.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <BookOpen className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p>No progress items added yet</p>
                    <p className="text-sm">Click "Add Item" or "AI Generate" to get started</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="evaluation" className="space-y-6">
                {/* Strengths & Growth sections */}
                <div className="grid grid-cols-1 gap-4">
                  {/* Strengths Section */}
                  <Card className="border-green-200 bg-green-50/50 dark:bg-green-900/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-green-900 dark:text-green-100 flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Key Strengths
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-row items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <IntelligentSuggestionsDropdown
                            type="strengths"
                            currentSubject={currentSubject}
                            studentLevel={getStudentLevel()}
                            performanceLevel={studentPerformanceLevel}
                            onSelect={(content) => handleInputChange("strengths", content)}
                            maxSelections={3}
                            minSelections={1}
                            currentValue={formData.strengths}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => generateAIContent("strengths")}
                          disabled={isGenerating}
                          className="border-green-200 text-green-700 hover:bg-green-50 w-full sm:w-auto flex-shrink-0 touch-manipulation"
                        >
                          <Wand2 className="h-4 w-4 mr-2" />
                          AI Generate
                        </Button>
                      </div>
                      <Textarea
                        id="strengths"
                        value={formData.strengths}
                        onChange={(e) => handleInputChange("strengths", e.target.value)}
                        placeholder="Describe the student's key strengths and positive attributes..."
                        rows={4}
                        className="border-green-200 focus:border-green-400 bg-white dark:bg-slate-900/60 dark:text-foreground text-sm sm:text-base resize-y min-h-[100px] touch-manipulation"
                      />
                    </CardContent>
                  </Card>

                  {/* Growth Areas Section */}
                  <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-900/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-orange-900 dark:text-orange-100 flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Areas for Growth
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-row items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <IntelligentSuggestionsDropdown
                            type="growth"
                            currentSubject={currentSubject}
                            studentLevel={getStudentLevel()}
                            performanceLevel={studentPerformanceLevel}
                            onSelect={(content) => handleInputChange("growth", content)}
                            maxSelections={3}
                            minSelections={1}
                            currentValue={formData.growth}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => generateAIContent("growth")}
                          disabled={isGenerating}
                          className="border-orange-200 text-orange-700 hover:bg-orange-50 w-full sm:w-auto flex-shrink-0 touch-manipulation"
                        >
                          <Wand2 className="h-4 w-4 mr-2" />
                          AI Generate
                        </Button>
                      </div>
                      <Textarea
                        id="growth"
                        value={formData.growth}
                        onChange={(e) => handleInputChange("growth", e.target.value)}
                        placeholder="Identify areas where the student can improve..."
                        rows={4}
                        className="border-orange-200 focus:border-orange-400 bg-white dark:bg-slate-900/60 dark:text-foreground text-sm sm:text-base resize-y min-h-[100px] touch-manipulation"
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Instructor Comments - Full Width */}
                <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-900/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-blue-900 dark:text-blue-100 flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      Instructor Comments
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-2">
                      <div className="flex-1 min-w-0">
                        <IntelligentSuggestionsDropdown
                          type="comments"
                          currentSubject={currentSubject}
                          studentLevel={getStudentLevel()}
                          performanceLevel={studentPerformanceLevel}
                          onSelect={(content) => handleInputChange("comments", content)}
                          maxSelections={3}
                          minSelections={1}
                          currentValue={formData.comments}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => generateAIContent("comments")}
                        disabled={isGenerating}
                        className="border-blue-200 text-blue-700 hover:bg-blue-50 w-full sm:w-auto flex-shrink-0 touch-manipulation"
                      >
                        <Wand2 className="h-4 w-4 mr-2" />
                        AI Generate
                      </Button>
                    </div>
                    <Textarea
                      id="comments"
                      value={formData.comments}
                      onChange={(e) => handleInputChange("comments", e.target.value)}
                      placeholder="Overall instructor evaluation and comments..."
                      rows={4}
                      className="border-blue-200 focus:border-blue-400 bg-white dark:bg-slate-900/60 dark:text-foreground text-sm sm:text-base resize-y min-h-[100px] touch-manipulation"
                    />
                  </CardContent>
                </Card>

                {/* Certificate & Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  <Card className="border-purple-200 bg-purple-50/50 dark:bg-purple-900/20">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-purple-900 dark:text-purple-100 flex items-center gap-2">
                        <GraduationCap className="h-5 w-5" />
                        Certificate Text
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        id="certificateText"
                        value={formData.certificateText}
                        onChange={(e) => handleInputChange("certificateText", e.target.value)}
                        placeholder="This certifies that [Student Name] has successfully completed..."
                        rows={3}
                        className="border-purple-200 focus:border-purple-400 bg-white dark:bg-slate-900/60 dark:text-foreground"
                      />
                    </CardContent>
                  </Card>

                  <Card className="border-gray-200 bg-gray-50/70 dark:bg-slate-900/40">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Additional Settings
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="showPaymentDetails"
                          checked={formData.showPaymentDetails}
                          onCheckedChange={(checked) => handleInputChange("showPaymentDetails", checked)}
                        />
                        <Label htmlFor="showPaymentDetails" className="text-sm">
                          Show payment details on certificate
                        </Label>
                      </div>
                      <div className="text-sm text-gray-600">
                        <p>• Auto-save is enabled</p>
                        <p>• Report validation active</p>
                        <p>• Professional formatting applied</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>

            {/* Enhanced Report Quality Selection */}
            <div className="mt-6 p-6 border border-blue-200 rounded-xl bg-gradient-to-br from-blue-50 to-white">
              <Label className="text-lg font-semibold text-blue-900 mb-4 block flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Settings className="h-3 w-3 text-white" />
                </div>
                Report Quality
              </Label>
              <div className="space-y-4">
                <div 
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    selectedTier === "minimal" 
                      ? "border-gray-600 bg-gray-50 shadow-lg transform scale-105" 
                      : "border-gray-300 hover:border-gray-400 hover:shadow-md"
                  }`}
                  onClick={() => setSelectedTier("minimal")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-600 rounded-lg flex items-center justify-center">
                      <FileText className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">Minimal</h3>
                      <p className="text-sm text-gray-600">Essential information only</p>
                    </div>
                    {selectedTier === "minimal" && (
                      <div className="w-6 h-6 bg-gray-600 rounded-full flex items-center justify-center">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </div>

                <div 
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    selectedTier === "standard" 
                      ? "border-blue-600 bg-blue-50 shadow-lg transform scale-105" 
                      : "border-gray-300 hover:border-blue-400 hover:shadow-md"
                  }`}
                  onClick={() => setSelectedTier("standard")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                      <BarChart3 className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">Standard</h3>
                      <p className="text-sm text-gray-600">Comprehensive analysis</p>
                    </div>
                    {selectedTier === "standard" && (
                      <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </div>

                <div 
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    selectedTier === "hd" 
                      ? "border-amber-600 bg-amber-50 shadow-lg transform scale-105" 
                      : "border-gray-300 hover:border-amber-400 hover:shadow-md"
                  }`}
                  onClick={() => setSelectedTier("hd")}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center">
                      <Crown className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">HD Premium</h3>
                      <p className="text-sm text-gray-600">Ultra-detailed reports</p>
                    </div>
                    {selectedTier === "hd" && (
                      <div className="w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center">
                        <Check className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced Actions */}
            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button
                onClick={() => setShowPreview(!showPreview)}
                variant="outline"
                size="lg"
                className="border-blue-300 text-blue-700 hover:bg-blue-50 shadow-sm"
              >
                <Eye className="h-4 w-4 mr-2" />
                {showPreview ? "Hide Preview" : "Show Preview"}
              </Button>
              <Button
                onClick={handleDownloadPDF}
                disabled={isGenerating || !formData.studentName.trim()}
                variant="outline"
                size="lg"
                className="border-green-300 text-green-700 hover:bg-green-50 shadow-sm"
              >
                {isGenerating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Generating...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </>
                )}
              </Button>
            </div>
            
            <Button
              onClick={handleSaveReport}
              disabled={isSaving || !formData.studentName.trim()}
              size="lg"
              className="w-full mt-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving Report...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Report
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Enhanced Preview Section */}
        <Card className="border-slate-200 shadow-lg bg-gradient-to-br from-slate-50 to-white">
          <CardHeader className="pb-4 bg-gradient-to-r from-slate-100 to-slate-50 border-b border-slate-200">
            <CardTitle className="flex items-center justify-between text-slate-900">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-600 rounded-lg flex items-center justify-center">
                  <Eye className="h-4 w-4 text-white" />
                </div>
                Report Preview
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                Live Preview
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {showPreview ? (
              <div className="space-y-4">
                {/* Enhanced Preview Header with Zoom Controls */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                    <span className="font-medium">Interactive Preview Mode</span>
                    <span className="hidden sm:inline text-xs text-slate-500">({previewZoom}%)</span>
                  </div>
                  
                  {/* Zoom Controls */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1 bg-white rounded-lg border border-blue-200 p-1 shadow-sm">
                      <Button
                        onClick={() => setPreviewZoom(prev => Math.max(50, prev - 10))}
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-blue-50"
                        title="Zoom Out"
                      >
                        <ZoomOut className="h-4 w-4 text-blue-600" />
                      </Button>
                      <div className="px-2 py-1 text-xs font-medium text-blue-700 min-w-[3rem] text-center">
                        {previewZoom}%
                      </div>
                      <Button
                        onClick={() => setPreviewZoom(prev => Math.min(200, prev + 10))}
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 hover:bg-blue-50"
                        title="Zoom In"
                      >
                        <ZoomIn className="h-4 w-4 text-blue-600" />
                      </Button>
                    </div>
                    
                    <Button
                      onClick={() => {
                        if (previewContainerRef.current) {
                          const containerWidth = previewContainerRef.current.clientWidth
                          const reportWidth = 210 * 3.779527559 // Convert mm to px (1mm = 3.779527559px)
                          const fitZoom = Math.floor((containerWidth / reportWidth) * 100)
                          setPreviewZoom(Math.max(50, Math.min(100, fitZoom)))
                        }
                      }}
                      size="sm"
                      variant="outline"
                      className="h-8 border-blue-300 text-blue-700 hover:bg-blue-50 text-xs"
                      title="Fit to Width"
                    >
                      <Maximize2 className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Fit</span>
                    </Button>
                    
                    <Button
                      onClick={() => setPreviewZoom(100)}
                      size="sm"
                      variant="outline"
                      className="h-8 border-blue-300 text-blue-700 hover:bg-blue-50 text-xs"
                      title="Reset Zoom"
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Reset</span>
                    </Button>
                    
                    <Button
                      onClick={() => {
                        setShowPreview(false)
                        setShowPrintPreview(true)
                      }}
                      size="sm"
                      variant="outline"
                      className="h-8 border-purple-300 text-purple-700 hover:bg-purple-50 text-xs"
                    >
                      <Printer className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline">Print & PDF</span>
                      <span className="sm:hidden">PDF</span>
                    </Button>
                  </div>
                </div>
                
                {/* Enhanced Preview Container with Zoom */}
                <div 
                  ref={previewContainerRef}
                  className="report-preview-container border-2 border-slate-300 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 shadow-xl p-2 sm:p-4 overflow-auto min-h-[300px] sm:min-h-[400px]"
                  style={{ 
                    maxHeight: "calc(90vh - 200px)",
                    touchAction: "pan-x pan-y pinch-zoom",
                    WebkitOverflowScrolling: "touch",
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "flex-start"
                  }}
                  onWheel={(e) => {
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault()
                      const delta = e.deltaY > 0 ? -5 : 5
                      setPreviewZoom(prev => Math.max(50, Math.min(200, prev + delta)))
                    }
                  }}
                >
                  <div 
                    className="bg-white rounded-lg shadow-2xl transition-transform duration-200 ease-out"
                    style={{ 
                      transform: `scale(${previewZoom / 100})`,
                      transformOrigin: "top center",
                      width: "210mm",
                      minWidth: "210mm",
                      maxWidth: "210mm",
                      flexShrink: 0
                    }}
                  >
                    <div ref={reportRef} style={{ overflow: "visible", width: "210mm", minWidth: "210mm", maxWidth: "210mm", boxSizing: "border-box", display: "block", visibility: "visible" }}>
                      {selectedTier === "minimal" && minimalReportData ? (
                        <div
                          style={{
                            minHeight: "297mm",
                            maxHeight: "297mm",
                            width: "210mm",
                            minWidth: "210mm",
                            maxWidth: "210mm",
                            display: "block",
                            visibility: "visible"
                          }}
                        >
                          <UnifiedReportGenerator reportData={minimalReportData} settings={reportSettings} tier={selectedTier} />
                        </div>
                      ) : (
                        <ReportContent
                          formData={formData}
                          settings={reportSettings}
                          printMode={true}
                          minimalView={selectedTier === "minimal"}
                          tier={selectedTier}
                        />
                      )}
                    </div>
                  </div>
                </div>
                
                {selectedTier === "hd" && (
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Crown className="h-4 w-4 text-amber-600" />
                      <span className="font-semibold text-amber-900">HD Premium Active</span>
                    </div>
                    <p className="text-sm text-amber-800">
                      Enhanced with detailed analytics, visual charts, and comprehensive evaluations.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-gradient-to-b from-slate-50 to-white rounded-lg border border-slate-200">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                  <Eye className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Ready to Preview</h3>
                <p className="text-slate-600 text-sm mb-6 max-w-sm">
                  Generate a live preview of your report to see how it will look before downloading or saving.
                </p>
                <Button 
                  onClick={() => setShowPreview(true)} 
                  size="lg" 
                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Generate Preview
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Print Preview Modal */}
      {showPrintPreview && (
        <PrintPreview 
          formData={formData} 
          settings={reportSettings} 
          onClose={() => {
            setShowPrintPreview(false)
            setShowPreview(true) // Restore inline preview when closing modal
          }}
          tier={selectedTier}
        />
      )}
    </div>
  )
}
