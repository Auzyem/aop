import type { Meta, StoryObj } from '@storybook/react';
import { FileUploader } from './file-uploader';

const meta: Meta<typeof FileUploader> = {
  title: 'UI/FileUploader',
  component: FileUploader,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  argTypes: {
    onFile: { action: 'file selected' },
  },
};
export default meta;
type Story = StoryObj<typeof FileUploader>;

export const Default: Story = {
  args: {
    label: 'Drop files or click to upload',
    accept: '.pdf,image/*',
    maxSizeMb: 50,
  },
};

export const Uploading: Story = {
  args: {
    label: 'Drop files or click to upload',
    uploading: true,
    progress: 45,
  },
};

export const UploadComplete: Story = {
  args: {
    label: 'Drop files or click to upload',
    uploading: true,
    progress: 100,
  },
};

export const MobileLabel: Story = {
  args: {
    label: 'Tap to upload or take photo',
    accept: '.pdf,image/*',
    maxSizeMb: 20,
  },
};

export const PDFOnly: Story = {
  args: {
    label: 'Upload PDF document',
    accept: '.pdf',
    maxSizeMb: 10,
  },
};
