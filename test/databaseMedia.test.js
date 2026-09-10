const test = require('node:test');
const assert = require('node:assert/strict');

const database = require('../utils/db');
database.ensureDbConnected = async () => true;

const GalleryImage = require('../models/GalleryImage');
const Dress = require('../models/Dress');
const galleryRoutes = require('../routes/galleryRoutes');
const dressRoutes = require('../routes/dressRoutes');

const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(headers) {
      Object.assign(this.headers, headers);
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    }
  };
}

test('gallery uploads store the image bytes in MongoDB fields', async (t) => {
  const originalSave = GalleryImage.prototype.save;
  let savedDocument;
  GalleryImage.prototype.save = async function saveStub() {
    savedDocument = this;
    return this;
  };
  t.after(() => {
    GalleryImage.prototype.save = originalSave;
  });

  const imageBytes = jpegBytes;
  const response = createResponse();
  await galleryRoutes.uploadImage({
    file: { buffer: imageBytes, mimetype: 'image/jpeg' },
    body: { title: 'Reception look', category: 'bridal' }
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.deepEqual(Buffer.from(savedDocument.imageData), imageBytes);
  assert.equal(savedDocument.imageContentType, 'image/jpeg');
  assert.match(savedDocument.imageUrl, /^\/api\/gallery\/[a-f0-9]{24}\/image$/);
});

test('dress uploads store image bytes and return a database image URL', async (t) => {
  const originalSave = Dress.prototype.save;
  let savedDocument;
  Dress.prototype.save = async function saveStub() {
    savedDocument = this;
    return this;
  };
  t.after(() => {
    Dress.prototype.save = originalSave;
  });

  const imageBytes = pngBytes;
  const response = createResponse();
  await dressRoutes.createDress({
    file: { buffer: imageBytes, mimetype: 'image/png' },
    body: { name: 'Silk bridal saree', price: '24999', description: 'Handwoven silk.' }
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.success, true);
  assert.equal(savedDocument.price, 24999);
  assert.deepEqual(Buffer.from(savedDocument.imageData), imageBytes);
  assert.equal(savedDocument.imageContentType, 'image/png');
  assert.match(savedDocument.imageUrl, /^\/api\/dresses\/[a-f0-9]{24}\/image$/);
});

test('gallery media endpoint streams stored bytes with the saved content type', async (t) => {
  const originalFindById = GalleryImage.findById;
  const imageBytes = Buffer.from([0xff, 0xd8, 0xff]);
  GalleryImage.findById = () => ({
    select: async () => ({ imageData: imageBytes, imageContentType: 'image/jpeg' })
  });
  t.after(() => {
    GalleryImage.findById = originalFindById;
  });

  const response = createResponse();
  await galleryRoutes.getGalleryImage({ params: { id: '507f1f77bcf86cd799439011' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'image/jpeg');
  assert.deepEqual(response.body, imageBytes);
});

test('invalid gallery categories are rejected before saving', async () => {
  const response = createResponse();
  await galleryRoutes.uploadImage({
    file: { buffer: jpegBytes, mimetype: 'image/jpeg' },
    body: { title: 'Invalid category', category: 'unknown' }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
});

test('files with a spoofed image MIME type are rejected', async () => {
  const response = createResponse();
  await galleryRoutes.uploadImage({
    file: { buffer: Buffer.from('not really an image'), mimetype: 'image/jpeg' },
    body: { title: 'Spoofed upload', category: 'bridal' }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /not a valid supported image/i);
});
