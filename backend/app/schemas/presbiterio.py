from pydantic import BaseModel

class PresbiterioBase(BaseModel):
    nome: str

class PresbiterioCreate(PresbiterioBase):
    pass

class PresbiterioResponse(PresbiterioBase):
    id: int

    class Config:
        from_attributes = True
