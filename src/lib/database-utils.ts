import { supabase } from './supabase';

export interface DatabaseSchema {
  tableName: string;
  columns: Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>;
}

export const getTableSchema = async (tableName: string): Promise<DatabaseSchema | null> => {
  try {
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_name', tableName)
      .eq('table_schema', 'public');

    if (error) {
      console.error('Error fetching schema:', error);
      return null;
    }

    return {
      tableName,
      columns: data || []
    };
  } catch (err) {
    console.error('Schema fetch error:', err);
    return null;
  }
};

export const verifyStudentsTable = async (): Promise<boolean> => {
  try {
    const schema = await getTableSchema('students');
    
    if (!schema) {
      console.error('Could not fetch students table schema');
      return false;
    }

    console.log('Students table schema:', schema);
    
    // Check for required columns
    const requiredColumns = [
      'full_name',
      'age', 
      'grade',
      'school_name',
      'gender',
      'parent_name',
      'parent_phone',
      'parent_email',
      'course_interest',
      'preferred_schedule',
      'hear_about_us'
    ];

    const existingColumns = schema.columns.map(col => col.column_name);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

    if (missingColumns.length > 0) {
      console.error('Missing columns in students table:', missingColumns);
      return false;
    }

    console.log('Students table schema is valid');
    return true;
  } catch (err) {
    console.error('Schema verification error:', err);
    return false;
  }
};

export const testDatabaseConnection = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase
      .from('students')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
    
    console.log('Database connection test successful');
    return true;
  } catch (err) {
    console.error('Database connection test error:', err);
    return false;
  }
}; 