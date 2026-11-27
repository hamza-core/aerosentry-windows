using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace AeroSentry.Api.Migrations;

/// <inheritdoc />
public partial class _20261122102235_AddCameras : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Cameras",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PropertyId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Name = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: false),
                SourceType = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                Host = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                Port = table.Column<int>(type: "int", nullable: false),
                StreamPath = table.Column<string>(type: "nvarchar(300)", maxLength: 300, nullable: false),
                Username = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                Password = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                IsActive = table.Column<bool>(type: "bit", nullable: false),
                CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Cameras", x => x.Id);
                table.ForeignKey(
                    name: "FK_Cameras_Properties_PropertyId",
                    column: x => x.PropertyId,
                    principalTable: "Properties",
                    principalColumn: "Id",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_Cameras_PropertyId_Name",
            table: "Cameras",
            columns: new[] { "PropertyId", "Name" },
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "Cameras");
    }
}
