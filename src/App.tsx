import { useState, useRef, useEffect } from 'react';
import { DndProvider, useDrag } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { CourseCard } from './components/CourseCard';
import { FacultyChip } from './components/FacultyChip';
import { CalendarGrid } from './components/CalendarGrid';
import { EditCourseDialog } from './components/EditCourseDialog';
import { INITIAL_COURSES } from './data/courses';
import { Course, DayOfWeek, TIME_SLOTS, DAYS, Faculty, formatTime12Hour } from './types/course';
import { Calendar, Clock, Users, Upload, Trash2, Save, Check, Star, FileSpreadsheet, FileDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Textarea } from './components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './components/ui/accordion';
import { Button } from './components/ui/button';
import { Toaster } from './components/ui/sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from './components/ui/alert-dialog';
import * as XLSX from 'xlsx';
import { toast } from 'sonner@2.0.3';
import { motion } from 'motion/react';

const STORAGE_KEY = 'vcd-mfa-schedule';
const DEFAULT_STORAGE_KEY = 'vcd-mfa-default-schedule';
const FACULTY_STORAGE_KEY = 'vcd-mfa-faculty-list';

const DEFAULT_FACULTY: Faculty[] = ['Mike Strobert', 'Anne Jordan', 'Dan DeLuna', 'Adam Smith', 'Peter Byrne', 'TBD'];

// Simple available course card - only shows code and title
function AvailableCourseCard({ course }: { course: Course }) {
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'COURSE',
    item: course,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  return (
    <div
      ref={drag}
      className={`p-2 bg-gray-50 rounded border border-gray-200 text-sm cursor-move hover:shadow-md transition-all ${
        isDragging ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <span className="font-semibold">{course.code}</span> - {course.title}
    </div>
  );
}

export default function App() {
  const [courses, setCourses] = useState<Course[]>(() => {
    // Try to load from localStorage on initial mount
    // First check for current session save
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved courses:', e);
      }
    }
    // Then check for default save
    const defaultSaved = localStorage.getItem(DEFAULT_STORAGE_KEY);
    if (defaultSaved) {
      try {
        return JSON.parse(defaultSaved);
      } catch (e) {
        console.error('Failed to parse default courses:', e);
      }
    }
    // Finally fallback to INITIAL_COURSES
    return INITIAL_COURSES;
  });
  const [facultyList, setFacultyList] = useState<Faculty[]>(() => {
    // Load from localStorage or use defaults
    const saved = localStorage.getItem(FACULTY_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved faculty list:', e);
      }
    }
    return DEFAULT_FACULTY;
  });
  const [notes, setNotes] = useState('');
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showClearScheduleDialog, setShowClearScheduleDialog] = useState(false);
  const [showSaveDefaultDialog, setShowSaveDefaultDialog] = useState(false);
  const [isSaved, setIsSaved] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedRef = useRef<string>(JSON.stringify(INITIAL_COURSES));
  const sectionCountersRef = useRef<Record<string, number>>({});

  interface ScheduleExportRow {
    courseCode: string;
    section: string;
    title: string;
    instructor: string;
    room: string;
    status: string;
    day: string;
    startTime: string;
    endTime: string;
  }

  const buildScheduleExportRows = (): ScheduleExportRow[] => {
    const scheduled = courses.filter(course => course.sectionNumber || course.timeSlots.length > 0);

    return scheduled.flatMap(course => {
      const base: Omit<ScheduleExportRow, 'day' | 'startTime' | 'endTime'> = {
        courseCode: course.code,
        section: course.sectionNumber ? course.sectionNumber : '',
        title: course.title,
        instructor: course.instructor,
        room: course.room,
        status: course.status.charAt(0).toUpperCase() + course.status.slice(1),
      };

      if (course.timeSlots.length === 0) {
        return [
          {
            ...base,
            day: 'TBD',
            startTime: '',
            endTime: '',
          },
        ];
      }

      return course.timeSlots.map(slot => ({
        ...base,
        day: slot.day,
        startTime: formatTime12Hour(slot.startTime),
        endTime: formatTime12Hour(slot.endTime),
      }));
    });
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const createPdfBlob = (lines: string[]): Blob => {
    const escapePdfText = (text: string) =>
      text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    const lineCommands = lines
      .map((line, index) => {
        const escaped = escapePdfText(line);
        const suffix = index < lines.length - 1 ? '\nT*' : '';
        return `(${escaped}) Tj${suffix}`;
      })
      .join('\n');

    const textStream = `BT\n/F1 10 Tf\n1 0 0 1 72 750 Tm\n14 TL\n${lineCommands}\nET`;

    const encoder = new TextEncoder();
    const textStreamBytes = encoder.encode(textStream);

    const objects = [
      ['1 0 obj', '<< /Type /Catalog /Pages 2 0 R >>', 'endobj', ''].join('\n'),
      ['2 0 obj', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'endobj', ''].join('\n'),
      [
        '3 0 obj',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        'endobj',
        '',
      ].join('\n'),
      `4 0 obj\n<< /Length ${textStreamBytes.length} >>\nstream\n${textStream}\nendstream\nendobj\n`,
      ['5 0 obj', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'endobj', ''].join('\n'),
    ];

    const header = '%PDF-1.4\n';
    let pdfString = header;
    const offsets: number[] = [];
    let currentOffset = encoder.encode(header).length;

    objects.forEach(obj => {
      offsets.push(currentOffset);
      pdfString += obj;
      currentOffset += encoder.encode(obj).length;
    });

    const xrefOffset = currentOffset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    xref += offsets
      .map(offset => `${offset.toString().padStart(10, '0')} 00000 n \n`)
      .join('');

    const trailer = `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefOffset}\n%%EOF`;

    pdfString += xref + trailer;

    return new Blob([encoder.encode(pdfString)], { type: 'application/pdf' });
  };

  // Track changes to courses and mark as unsaved
  useEffect(() => {
    const currentState = JSON.stringify(courses);
    if (currentState !== lastSavedRef.current) {
      setIsSaved(false);
    }
  }, [courses]);

  // Sync faculty list with courses - add any new instructors found in courses
  useEffect(() => {
    const allInstructors = Array.from(new Set(courses.map(c => c.instructor).filter(Boolean)));
    const newInstructors = allInstructors.filter(inst => !facultyList.includes(inst));
    if (newInstructors.length > 0) {
      const updatedList = [...facultyList, ...newInstructors];
      setFacultyList(updatedList);
      localStorage.setItem(FACULTY_STORAGE_KEY, JSON.stringify(updatedList));
    }
  }, [courses, facultyList]);

  // Save faculty list to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(FACULTY_STORAGE_KEY, JSON.stringify(facultyList));
  }, [facultyList]);

  // Track the highest section numbers that have been assigned per course code
  useEffect(() => {
    const updatedCounters = { ...sectionCountersRef.current };
    let countersChanged = false;

    courses.forEach(course => {
      if (!course.sectionNumber) return;

      const numericSection = parseInt(course.sectionNumber, 10);
      if (Number.isNaN(numericSection)) return;

      if (numericSection > (updatedCounters[course.code] ?? 0)) {
        updatedCounters[course.code] = numericSection;
        countersChanged = true;
      }
    });

    if (countersChanged || Object.keys(sectionCountersRef.current).length === 0) {
      sectionCountersRef.current = updatedCounters;
    }
  }, [courses]);

  const recordSectionNumber = (course: Course) => {
    if (!course.sectionNumber) return;

    const numericSection = parseInt(course.sectionNumber, 10);
    if (Number.isNaN(numericSection)) return;

    const currentMax = sectionCountersRef.current[course.code] ?? 0;
    if (numericSection > currentMax) {
      sectionCountersRef.current = {
        ...sectionCountersRef.current,
        [course.code]: numericSection,
      };
    }
  };

  // Generate next section number for a course code, ensuring the sequence always increases
  const getNextSectionNumber = (courseCode: string): string => {
    const highestExisting = courses.reduce((max, course) => {
      if (course.code !== courseCode || !course.sectionNumber) return max;

      const numericSection = parseInt(course.sectionNumber, 10);
      if (Number.isNaN(numericSection)) return max;

      return Math.max(max, numericSection);
    }, 0);

    const historicalMax = sectionCountersRef.current[courseCode] ?? 0;
    const nextNumber = Math.max(highestExisting, historicalMax) + 1;

    return nextNumber.toString().padStart(2, '0');
  };

  const handleDropCourse = (course: Course, day: DayOfWeek, time: string) => {
    // Calculate end time (default 2 hour 50 min block - typical RIT class)
    const startHour = parseInt(time.split(':')[0]);
    const startMinute = parseInt(time.split(':')[1]);
    const endHour = startHour + 2;
    const endMinute = startMinute + 50;
    const endTime = `${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`;
    
    // Create a new course instance with unique section number
    const sectionNumber = getNextSectionNumber(course.code);
    // Use course code as base ID to avoid issues with dragging already-scheduled courses
    const baseId = course.code.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newInstance: Course = {
      ...course,
      id: `${baseId}-${sectionNumber}`,
      sectionNumber,
      timeSlots: [{ day, startTime: time, endTime }],
      room: course.room === 'TBD' ? '07-1315' : course.room,
    };

    setEditingCourse(newInstance);
  };

  const handleSaveCourse = (updatedCourse: Course) => {
    // Check if this is a new instance or updating an existing one
    recordSectionNumber(updatedCourse);

    setCourses(prevCourses => {
      const existingIndex = prevCourses.findIndex(c => c.id === updatedCourse.id);

      if (existingIndex >= 0) {
        return prevCourses.map(c => c.id === updatedCourse.id ? updatedCourse : c);
      }

      return [...prevCourses, updatedCourse];
    });
  };

  const handleAddInstructor = (name: string) => {
    const trimmedName = name.trim();
    if (trimmedName && !facultyList.includes(trimmedName)) {
      setFacultyList([...facultyList, trimmedName]);
    }
  };

  const handleUnscheduleCourse = (course: Course) => {
    // Remove the course instance entirely (only remove instances with section numbers)
    if (course.sectionNumber) {
      setCourses(courses.filter(c => c.id !== course.id));
    } else {
      // If it's a base course without section, just clear its time slots
      const updatedCourse: Course = {
        ...course,
        timeSlots: [],
      };
      setCourses(courses.map(c => c.id === course.id ? updatedCourse : c));
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

        // Convert Excel data to Course objects
        const usedIds = new Set(courses.map(c => c.id));
        const newCourses: Course[] = [];

        jsonData.forEach((row, index) => {
          const code = row['Course Code'] || row['Code'] || row['code'] || '';
          const title = row['Title'] || row['title'] || row['Course Title'] || '';

          if (!code || !title) {
            return; // Only include courses with code and title
          }

          const instructor = (row['Instructor'] || row['instructor'] || 'TBD') as Faculty;
          const room = row['Room'] || row['room'] || 'TBD';
          const status = (row['Status'] || row['status'] || 'backlog') as 'confirmed' | 'tentative' | 'backlog';

          const baseIdFromCode = code.toLowerCase().replace(/[^a-z0-9]/g, '-');
          const baseId = baseIdFromCode ? baseIdFromCode : `course-${index}`;
          let uniqueId = baseId;
          let suffix = 1;
          while (usedIds.has(uniqueId)) {
            uniqueId = `${baseId}-${suffix}`;
            suffix += 1;
          }
          usedIds.add(uniqueId);

          newCourses.push({
            id: uniqueId,
            code,
            title,
            instructor,
            room,
            timeSlots: [],
            status,
          });
        });

        if (newCourses.length > 0) {
          setCourses([...courses, ...newCourses]);
          toast.success(`Successfully imported ${newCourses.length} courses`);
        } else {
          toast.error('No valid courses found in the spreadsheet');
        }
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        toast.error('Failed to parse Excel file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearAvailableCourses = () => {
    // Keep only scheduled courses (those with section numbers or time slots)
    const scheduledOnly = courses.filter(c => c.sectionNumber || c.timeSlots.length > 0);
    setCourses(scheduledOnly);
    setShowClearDialog(false);
    toast.success('Available courses cleared');
  };

  const handleSaveSchedule = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
      lastSavedRef.current = JSON.stringify(courses);
      setIsSaved(true);
      toast.success('Schedule saved successfully');
    } catch (error) {
      console.error('Failed to save schedule:', error);
      toast.error('Failed to save schedule');
    }
  };

  const handleClearSchedule = () => {
    // Remove all scheduled courses, keep only available courses
    const availableOnly = courses.filter(c => !c.sectionNumber && c.timeSlots.length === 0);
    setCourses(availableOnly);
    setShowClearScheduleDialog(false);
    toast.success('Schedule cleared');
  };

  const handleSaveAsDefault = () => {
    try {
      localStorage.setItem(DEFAULT_STORAGE_KEY, JSON.stringify(courses));
      setShowSaveDefaultDialog(false);
      toast.success('Saved as default schedule for all visitors');
    } catch (error) {
      console.error('Failed to save default schedule:', error);
      toast.error('Failed to save default schedule');
    }
  };

  const handleExportToExcel = () => {
    const rows = buildScheduleExportRows();

    if (rows.length === 0) {
      toast.error('No scheduled courses to export');
      return;
    }

    const worksheetData = rows.map(row => ({
      'Course Code': row.courseCode,
      Section: row.section,
      Title: row.title,
      Instructor: row.instructor,
      Room: row.room,
      Status: row.status,
      Day: row.day,
      'Start Time': row.startTime,
      'End Time': row.endTime,
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule');
    XLSX.writeFile(workbook, 'vcd-semester-schedule.xlsx');
    toast.success('Schedule exported to Excel');
  };

  const handleExportToPdf = () => {
    const rows = buildScheduleExportRows();

    if (rows.length === 0) {
      toast.error('No scheduled courses to export');
      return;
    }

    const headers = ['Course Code', 'Section', 'Title', 'Instructor', 'Room', 'Status', 'Day', 'Start', 'End'];
    const columnWidths = [12, 8, 28, 18, 10, 10, 10, 8, 8];

    const formatCell = (value: string, width: number) => {
      const trimmed = value.trim();
      if (trimmed.length > width) {
        return `${trimmed.slice(0, width - 3)}...`;
      }
      return trimmed.padEnd(width, ' ');
    };

    const headerLine = headers
      .map((header, index) => formatCell(header, columnWidths[index]))
      .join(' | ');

    const lineSeparator = '-'.repeat(headerLine.length);

    const dataLines = rows.map(row => {
      const values = [
        row.courseCode,
        row.section || '-',
        row.title,
        row.instructor,
        row.room,
        row.status,
        row.day,
        row.startTime,
        row.endTime,
      ];

      return values
        .map((value, index) => formatCell(value, columnWidths[index]))
        .join(' | ');
    });

    const lines = [
      'VCD MFA Fall Semester Schedule',
      '',
      headerLine,
      lineSeparator,
      ...dataLines,
    ];

    const pdfBlob = createPdfBlob(lines);
    downloadBlob(pdfBlob, 'vcd-semester-schedule.pdf');
    toast.success('Schedule exported to PDF');
  };

  // Scheduled courses are those with section numbers OR those with time slots
  const scheduledCourses = courses.filter(c => c.sectionNumber || c.timeSlots.length > 0);
  // Available courses are base courses (no section number and no time slots)
  const availableCourses = courses.filter(c => !c.sectionNumber && c.timeSlots.length === 0);
  
  // Get active faculty (those teaching scheduled courses) with course counts
  const activeFaculty = Array.from(new Set(scheduledCourses.map(c => c.instructor))).filter(Boolean);
  const facultyCourseCount = (faculty: string): number => {
    return scheduledCourses.filter(c => c.instructor === faculty && c.sectionNumber).length;
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <Toaster />
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-[1800px] mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-gray-900 mb-2">VCD MFA Fall Semester Course Planning</h1>
                <p className="text-gray-600">
                  Drag courses to schedule or click to edit
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 justify-end">
                <Button
                  onClick={handleExportToPdf}
                  variant="outline"
                  className="border-slate-600 text-slate-700 hover:bg-slate-50"
                  disabled={scheduledCourses.length === 0}
                >
                  <FileDown className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
                <Button
                  onClick={handleExportToExcel}
                  variant="outline"
                  className="border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                  disabled={scheduledCourses.length === 0}
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Export Excel
                </Button>
                <motion.div
                  animate={isSaved ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <Button
                    onClick={handleSaveSchedule}
                    variant={isSaved ? "outline" : "default"}
                    className={isSaved ? "border-green-600 text-green-600 hover:bg-green-50" : ""}
                  >
                    {isSaved ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                </motion.div>
                <Button
                  onClick={() => setShowClearScheduleDialog(true)}
                  variant="outline"
                  className="border-red-600 text-red-600 hover:bg-red-50"
                  disabled={scheduledCourses.length === 0}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Schedule
                </Button>
              </div>
            </div>
          </div>

          <Tabs defaultValue="schedule" className="space-y-4">
            <TabsList>
              <TabsTrigger value="schedule">
                <Calendar className="w-4 h-4 mr-2" />
                Weekly Schedule
              </TabsTrigger>
              <TabsTrigger value="courses">
                <Clock className="w-4 h-4 mr-2" />
                Course Lists
              </TabsTrigger>
            </TabsList>

            {/* Weekly Schedule Grid */}
            <TabsContent value="schedule">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Main Calendar - 10 columns */}
                <div className="lg:col-span-10">
                  <Card>
                    <CardHeader>
                      <CardTitle>Fall Semester Weekly Schedule</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="relative">
                        <CalendarGrid
                          scheduledCourses={scheduledCourses}
                          onDropCourse={handleDropCourse}
                          onUnschedule={handleUnscheduleCourse}
                          onEdit={setEditingCourse}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Sidebar - 2 columns */}
                <div className="lg:col-span-2">
                  <Card>
                      <CardContent className="p-0">
                        <Accordion type="multiple" defaultValue={['faculty', 'active', 'available']} className="w-full">
                          {/* Faculty Section */}
                          <AccordionItem value="faculty">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                <span>Faculty ({activeFaculty.length})</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="space-y-2">
                                {activeFaculty.length > 0 ? (
                                  activeFaculty.map(faculty => (
                                    <FacultyChip key={faculty} name={faculty} courseCount={facultyCourseCount(faculty)} />
                                  ))
                                ) : (
                                  <p className="text-sm text-gray-500">No active faculty</p>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>

                          {/* Active Courses Section */}
                          <AccordionItem value="active">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                <span>Active Courses ({scheduledCourses.length})</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {scheduledCourses.length > 0 ? (
                                  scheduledCourses.map(course => (
                                    <CourseCard
                                      key={course.id}
                                      course={course}
                                      onEdit={setEditingCourse}
                                    />
                                  ))
                                ) : (
                                  <p className="text-sm text-gray-500">No courses scheduled</p>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>

                          {/* Available Courses Section */}
                          <AccordionItem value="available">
                            <AccordionTrigger className="px-4 py-3 hover:no-underline">
                              <div className="flex items-center justify-between w-full pr-2">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4" />
                                  <span>Available Courses ({availableCourses.length})</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    className="h-7 px-2 rounded-md hover:bg-gray-100 transition-colors"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      fileInputRef.current?.click();
                                    }}
                                    title="Upload Excel file"
                                  >
                                    <Upload className="w-3 h-3" />
                                  </button>
                                  <button
                                    className="h-7 px-2 rounded-md text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowClearDialog(true);
                                    }}
                                    title="Clear available courses"
                                    disabled={availableCourses.length === 0}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="px-4 pb-4">
                              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                                {availableCourses.length > 0 ? (
                                  availableCourses.map(course => (
                                    <AvailableCourseCard
                                      key={course.id}
                                      course={course}
                                    />
                                  ))
                                ) : (
                                  <p className="text-sm text-gray-500">All courses scheduled</p>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </CardContent>
                    </Card>
                </div>
              </div>
            </TabsContent>

            {/* Course Lists */}
            <TabsContent value="courses">
              <div className="grid grid-cols-2 gap-6">
                {/* Scheduled Courses */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-green-700">
                      Scheduled Courses ({scheduledCourses.length})
                    </CardTitle>
                    <p className="text-sm text-gray-600">Courses currently on the calendar</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {scheduledCourses.map(course => (
                        <CourseCard
                          key={course.id}
                          course={course}
                          onEdit={setEditingCourse}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Available Courses */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-gray-700">
                      Available Courses ({availableCourses.length})
                    </CardTitle>
                    <p className="text-sm text-gray-600">Courses not yet scheduled</p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {availableCourses.map(course => (
                        <div
                          key={course.id}
                          className="p-2 bg-gray-50 rounded border border-gray-200 text-sm"
                        >
                          <span className="font-semibold">{course.code}</span> - {course.title}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Edit Course Dialog */}
        <EditCourseDialog
          course={editingCourse}
          open={!!editingCourse}
          onClose={() => setEditingCourse(null)}
          onSave={handleSaveCourse}
          facultyList={facultyList}
          onAddInstructor={handleAddInstructor}
        />

        {/* Clear Available Courses Confirmation Dialog */}
        <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Available Courses?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all {availableCourses.length} available course{availableCourses.length !== 1 ? 's' : ''} from the list. 
                Scheduled courses will not be affected. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearAvailableCourses}
                className="bg-red-600 hover:bg-red-700"
              >
                Clear Courses
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Clear Schedule Confirmation Dialog */}
        <AlertDialog open={showClearScheduleDialog} onOpenChange={setShowClearScheduleDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear Schedule?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove all {scheduledCourses.length} scheduled course{scheduledCourses.length !== 1 ? 's' : ''} from the calendar. 
                Available courses will not be affected. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleClearSchedule}
                className="bg-red-600 hover:bg-red-700"
              >
                Clear Schedule
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Hidden file input for Excel upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* Save as Default Confirmation Dialog */}
        <AlertDialog open={showSaveDefaultDialog} onOpenChange={setShowSaveDefaultDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save as Default Schedule?</AlertDialogTitle>
              <AlertDialogDescription>
                This will save the current schedule as the default for all visitors. The current state with{' '}
                {scheduledCourses.length} scheduled course{scheduledCourses.length !== 1 ? 's' : ''} and{' '}
                {availableCourses.length} available course{availableCourses.length !== 1 ? 's' : ''} will be loaded when anyone opens the application.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleSaveAsDefault}
                className="bg-amber-600 hover:bg-amber-700"
              >
                <Star className="w-4 h-4 mr-2" />
                Save as Default
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Save as Default Button - at bottom of page */}
        <div className="mt-12 pt-6 border-t border-gray-300 flex justify-center">
          <Button
            onClick={() => setShowSaveDefaultDialog(true)}
            variant="outline"
            className="border-amber-600 text-amber-600 hover:bg-amber-50"
          >
            <Star className="w-4 h-4 mr-2" />
            Save as Default
          </Button>
        </div>
      </div>
    </DndProvider>
  );
}
