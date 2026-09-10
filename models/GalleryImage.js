const mongoose = require('mongoose');

const galleryImageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Image title is required'],
      trim: true,
      maxlength: [160, 'Image title must be 160 characters or fewer']
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true,
      enum: ['all', 'bridal', 'engagement', 'hair', 'party'],
      default: 'all'
    },
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required']
    },
    imagePath: {
      type: String,
      default: ''
    },
    imageData: {
      type: Buffer,
      select: false
    },
    imageContentType: {
      type: String,
      enum: ['', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      default: ''
    }
  },
  {
    timestamps: true,
    bufferCommands: false
  }
);

module.exports = mongoose.model('GalleryImage', galleryImageSchema);
