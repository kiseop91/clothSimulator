#include "mesh/Mesh.h"

Mesh::Mesh()
    : vertexCount_(0), indexCount_(0), wireVertexCount_(0)
    , visible_(true), dynamic_(false)
{
}

Mesh::~Mesh() {
    cleanup();
}

void Mesh::init(wgpu::Device& device, const MeshData& data) {
    dynamic_ = false;
    initInternal(device, data);
}

void Mesh::initDynamic(wgpu::Device& device, const MeshData& data) {
    dynamic_ = true;
    initInternal(device, data);
}

void Mesh::initInternal(wgpu::Device& device, const MeshData& data) {
    vertexCount_ = static_cast<int>(data.vertices.size());
    indexCount_ = static_cast<int>(data.indices.size());

    // Vertex buffer
    {
        wgpu::BufferDescriptor desc{};
        desc.size = data.vertices.size() * sizeof(Vertex);
        desc.usage = wgpu::BufferUsage::Vertex | wgpu::BufferUsage::CopyDst;
        desc.mappedAtCreation = true;
        vbo_ = device.CreateBuffer(&desc);

        void* mapped = vbo_.GetMappedRange();
        memcpy(mapped, data.vertices.data(), desc.size);
        vbo_.Unmap();
    }

    // Index buffer
    {
        wgpu::BufferDescriptor desc{};
        desc.size = data.indices.size() * sizeof(uint32_t);
        desc.usage = wgpu::BufferUsage::Index | wgpu::BufferUsage::CopyDst;
        desc.mappedAtCreation = true;
        ebo_ = device.CreateBuffer(&desc);

        void* mapped = ebo_.GetMappedRange();
        memcpy(mapped, data.indices.data(), desc.size);
        ebo_.Unmap();
    }

    // Wireframe position-only VBO (stride=12, LineList)
    {
        std::vector<float> wireVerts;
        wireVerts.reserve((data.indices.size() / 3) * 18);
        for (size_t i = 0; i + 2 < data.indices.size(); i += 3) {
            uint32_t a = data.indices[i], b = data.indices[i+1], c = data.indices[i+2];
            const auto& pa = data.vertices[a].position;
            const auto& pb = data.vertices[b].position;
            const auto& pc = data.vertices[c].position;
            // edge a-b
            wireVerts.push_back(pa.x); wireVerts.push_back(pa.y); wireVerts.push_back(pa.z);
            wireVerts.push_back(pb.x); wireVerts.push_back(pb.y); wireVerts.push_back(pb.z);
            // edge b-c
            wireVerts.push_back(pb.x); wireVerts.push_back(pb.y); wireVerts.push_back(pb.z);
            wireVerts.push_back(pc.x); wireVerts.push_back(pc.y); wireVerts.push_back(pc.z);
            // edge c-a
            wireVerts.push_back(pc.x); wireVerts.push_back(pc.y); wireVerts.push_back(pc.z);
            wireVerts.push_back(pa.x); wireVerts.push_back(pa.y); wireVerts.push_back(pa.z);
        }
        wireVertexCount_ = static_cast<int>(wireVerts.size() / 3);

        wgpu::BufferDescriptor desc{};
        desc.size = wireVerts.size() * sizeof(float);
        desc.usage = wgpu::BufferUsage::Vertex | wgpu::BufferUsage::CopyDst;
        desc.mappedAtCreation = true;
        wireVbo_ = device.CreateBuffer(&desc);

        void* mapped = wireVbo_.GetMappedRange();
        memcpy(mapped, wireVerts.data(), desc.size);
        wireVbo_.Unmap();
    }
}

void Mesh::updateVertices(wgpu::Queue& queue, const std::vector<Vertex>& vertices) {
    if (!dynamic_ || !vbo_) return;
    queue.WriteBuffer(vbo_, 0, vertices.data(), vertices.size() * sizeof(Vertex));
}

void Mesh::updateWireVertices(wgpu::Queue& queue, const std::vector<Vertex>& vertices, const std::vector<uint32_t>& indices) {
    if (!dynamic_ || !wireVbo_) return;
    std::vector<float> wireVerts;
    wireVerts.reserve((indices.size() / 3) * 18);
    for (size_t i = 0; i + 2 < indices.size(); i += 3) {
        uint32_t a = indices[i], b = indices[i+1], c = indices[i+2];
        const auto& pa = vertices[a].position;
        const auto& pb = vertices[b].position;
        const auto& pc = vertices[c].position;
        wireVerts.push_back(pa.x); wireVerts.push_back(pa.y); wireVerts.push_back(pa.z);
        wireVerts.push_back(pb.x); wireVerts.push_back(pb.y); wireVerts.push_back(pb.z);
        wireVerts.push_back(pb.x); wireVerts.push_back(pb.y); wireVerts.push_back(pb.z);
        wireVerts.push_back(pc.x); wireVerts.push_back(pc.y); wireVerts.push_back(pc.z);
        wireVerts.push_back(pc.x); wireVerts.push_back(pc.y); wireVerts.push_back(pc.z);
        wireVerts.push_back(pa.x); wireVerts.push_back(pa.y); wireVerts.push_back(pa.z);
    }
    wireVertexCount_ = static_cast<int>(wireVerts.size() / 3);
    queue.WriteBuffer(wireVbo_, 0, wireVerts.data(), wireVerts.size() * sizeof(float));
}

glm::mat4 Mesh::getModelMatrix() const {
    glm::mat4 model(1.0f);
    model = glm::translate(model, position_);
    model = glm::rotate(model, glm::radians(rotation_.x), glm::vec3(1, 0, 0));
    model = glm::rotate(model, glm::radians(rotation_.y), glm::vec3(0, 1, 0));
    model = glm::rotate(model, glm::radians(rotation_.z), glm::vec3(0, 0, 1));
    model = glm::scale(model, scale_);
    return model;
}

void Mesh::cleanup() {
    vbo_ = nullptr;
    ebo_ = nullptr;
    wireVbo_ = nullptr;
    vertexCount_ = 0;
    indexCount_ = 0;
    wireVertexCount_ = 0;
}
